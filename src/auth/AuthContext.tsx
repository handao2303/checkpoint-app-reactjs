import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { exchange, getMe, logout, setAuthExpiredHandler, tokens, type User } from "../lib/api";
import { authErrorMessage } from "../lib/authErrors";
import { setObservabilityUser, trackError, trackEvent } from "../lib/observability";

interface AuthState {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  signupEmail: (email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  loginAnonymous: () => Promise<void>;
  upgradeAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Replace the cached user (e.g. after editing profile / avatar). */
  applyUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on load: prefer our stored backend token, else exchange a
  // live Supabase session (e.g. just back from a Google OAuth redirect).
  useEffect(() => {
    (async () => {
      try {
        if (tokens.access) {
          try {
            const restored = await getMe();
            setUser(restored);
            setObservabilityUser(restored);
            trackEvent("auth_session_restore", { source: "backend_token", status: "success" });
            return;
          } catch {
            tokens.clear();
            trackEvent("auth_session_restore", { source: "backend_token", status: "failed" });
          }
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const restored = await exchange(data.session.access_token);
          setUser(restored);
          setObservabilityUser(restored);
          trackEvent("auth_session_restore", { source: "supabase_session", status: "success" });
        }
      } catch {
        tokens.clear();
        trackError(new Error("session restore failed"), { feature: "auth", action: "auth_session_restore" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Catch sign-ins (OAuth redirect) and account upgrades (USER_UPDATED, e.g.
  // after an anonymous user confirms their email) — re-exchange to sync the BE.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) return;
      const isNewSignIn = event === "SIGNED_IN" && !tokens.access;
      if (isNewSignIn || event === "USER_UPDATED") {
        try {
          const nextUser = await exchange(session.access_token);
          setUser(nextUser);
          setObservabilityUser(nextUser);
          trackEvent("auth_exchange_success", { source: event.toLowerCase() });
        } catch {
          trackError(new Error("auth state exchange failed"), { feature: "auth", action: "auth_state_change" });
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // When apiFetch can't re-auth (refresh token AND Supabase session both gone),
  // drop the user → the app renders LoginPage.
  useEffect(() => {
    setAuthExpiredHandler(() => {
      trackEvent("auth_expired");
      setObservabilityUser(null);
      setUser(null);
    });
    return () => setAuthExpiredHandler(null);
  }, []);

  // Surface an OAuth redirect error (e.g. linking a Google identity already used
  // by another account) and clean it from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      trackEvent("login_failed", { method: "oauth_redirect", error_code: params.get("error_code") });
      alert(authErrorMessage({ code: params.get("error_code"), message: params.get("error_description") }));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loginEmail = async (email: string, password: string) => {
    trackEvent("login_attempt", { method: "email" });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const nextUser = await exchange(data.session.access_token);
      setUser(nextUser);
      setObservabilityUser(nextUser);
      trackEvent("login_success", { method: "email" });
    } catch (error) {
      trackError(error, { feature: "auth", action: "login_email" });
      trackEvent("login_failed", { method: "email" });
      throw error;
    }
  };

  const signupEmail = async (email: string, password: string) => {
    trackEvent("login_attempt", { method: "signup_email" });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      trackEvent("login_failed", { method: "signup_email" });
      throw error;
    }
    // If email confirmation is off, a session exists immediately.
    if (data.session) {
      const nextUser = await exchange(data.session.access_token);
      setUser(nextUser);
      setObservabilityUser(nextUser);
      trackEvent("signup_success", { method: "email" });
    } else {
      trackEvent("signup_success", { method: "email", requires_confirmation: true });
      throw new Error(t('kiem_tra_email_de_xac'));
    }
  };

  const loginGoogle = async () => {
    const redirectTo = window.location.origin;
    trackEvent("login_attempt", { method: "google", is_linking: !!user?.is_anonymous });
    // If signed in anonymously, LINK Google to the same Supabase user so the
    // guest's data (same `sub`) is preserved; otherwise a normal sign-in.
    if (user?.is_anonymous) {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        trackEvent("login_failed", { method: "google_link" });
        throw error;
      }
    } else {
      await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    }
  };

  const loginAnonymous = async () => {
    trackEvent("login_attempt", { method: "anonymous" });
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      trackEvent("login_failed", { method: "anonymous" });
      throw error;
    }
    if (!data.session) throw new Error(t('khong_tao_duoc_phien_khach'));
    const nextUser = await exchange(data.session.access_token);
    setUser(nextUser);
    setObservabilityUser(nextUser);
    trackEvent("anonymous_login_success");
  };

  // Convert the current anonymous user into a permanent account. Supabase keeps
  // the same user id (sub), so all their data is preserved. If email
  // confirmation is on, is_anonymous only flips to false after the user
  // confirms — the USER_UPDATED listener re-syncs the backend at that point.
  const upgradeAccount = async (email: string, password: string) => {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const nextUser = await exchange(data.session.access_token);
      setUser(nextUser);
      setObservabilityUser(nextUser);
      trackEvent("signup_success", { method: "upgrade_email" });
    }
  };

  const signOut = async () => {
    trackEvent("logout_click");
    try {
      await logout();
      await supabase.auth.signOut();
      trackEvent("logout_success");
    } catch (error) {
      trackError(error, { feature: "auth", action: "logout" });
      throw error;
    } finally {
      setObservabilityUser(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginEmail,
        signupEmail,
        loginGoogle,
        loginAnonymous,
        upgradeAccount,
        signOut,
        applyUser: setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
