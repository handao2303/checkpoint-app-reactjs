import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { exchange, getMe, logout, setAuthExpiredHandler, tokens, type User } from "../lib/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  signupEmail: (email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  loginAnonymous: () => Promise<void>;
  upgradeAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on load: prefer our stored backend token, else exchange a
  // live Supabase session (e.g. just back from a Google OAuth redirect).
  useEffect(() => {
    (async () => {
      try {
        if (tokens.access) {
          try {
            setUser(await getMe());
            return;
          } catch {
            tokens.clear();
          }
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) setUser(await exchange(data.session.access_token));
      } catch {
        tokens.clear();
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
          setUser(await exchange(session.access_token));
        } catch {
          /* ignore */
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // When apiFetch can't re-auth (refresh token AND Supabase session both gone),
  // drop the user → the app renders LoginPage.
  useEffect(() => {
    setAuthExpiredHandler(() => setUser(null));
    return () => setAuthExpiredHandler(null);
  }, []);

  const loginEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(await exchange(data.session.access_token));
  };

  const signupEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // If email confirmation is off, a session exists immediately.
    if (data.session) setUser(await exchange(data.session.access_token));
    else throw new Error("Kiểm tra email để xác nhận tài khoản, rồi đăng nhập.");
  };

  const loginGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const loginAnonymous = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.session) throw new Error("Không tạo được phiên khách");
    setUser(await exchange(data.session.access_token));
  };

  // Convert the current anonymous user into a permanent account. Supabase keeps
  // the same user id (sub), so all their data is preserved. If email
  // confirmation is on, is_anonymous only flips to false after the user
  // confirms — the USER_UPDATED listener re-syncs the backend at that point.
  const upgradeAccount = async (email: string, password: string) => {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    const { data } = await supabase.auth.getSession();
    if (data.session) setUser(await exchange(data.session.access_token));
  };

  const signOut = async () => {
    await logout();
    await supabase.auth.signOut();
    setUser(null);
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
