import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Sheet } from "../components/ui/Sheet";
import { Icon } from "../components/ui/Icon";
import { useAuth } from "../auth/AuthContext";
import { trackEvent } from "../lib/observability";

interface AuthGateState {
  /** Open the login-prompt sheet. `reason` (an i18n key) customizes the body
   *  copy; `source` is logged for analytics. */
  promptLogin: (opts?: { reason?: string; source?: string }) => void;
  /** Run `action` if signed in, otherwise open the login prompt. Returns true
   *  when the action ran. */
  requireAuth: (action: () => void, opts?: { reason?: string; source?: string }) => boolean;
}

const AuthGateContext = createContext<AuthGateState | null>(null);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<{ reason?: string } | null>(null);

  const promptLogin = useCallback((opts?: { reason?: string; source?: string }) => {
    trackEvent("login_wall_shown", { source: opts?.source ?? "unknown" });
    setPrompt({ reason: opts?.reason });
  }, []);

  const requireAuth = useCallback(
    (action: () => void, opts?: { reason?: string; source?: string }) => {
      if (user) {
        action();
        return true;
      }
      promptLogin(opts);
      return false;
    },
    [user, promptLogin],
  );

  return (
    <AuthGateContext.Provider value={{ promptLogin, requireAuth }}>
      {children}
      {prompt && (
        <Sheet title={t("dang_nhap_de_su_dung")} onClose={() => setPrompt(null)}>
          <div className="flex flex-col items-center gap-4 px-4 pb-6 pt-2 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary">
              <Icon name="profile" size={28} />
            </span>
            <p className="text-sm text-muted-foreground">
              {t(prompt.reason ?? "login_prompt_body")}
            </p>
            <button
              onClick={() => {
                trackEvent("login_wall_cta_click");
                setPrompt(null);
                navigate("/login");
              }}
              className="w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105"
            >
              {t("dang_nhap")}
            </button>
          </div>
        </Sheet>
      )}
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error("useAuthGate must be inside AuthGateProvider");
  return ctx;
}
