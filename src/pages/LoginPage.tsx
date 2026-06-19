import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { authErrorMessage } from "../lib/authErrors";
import { trackEvent } from "../lib/observability";
import { getPlatform, isInAppBrowser } from "../lib/platform";

export function LoginPage() {
  const { t } = useTranslation();
  const { loginIdentifier, signupEmail, loginGoogle, loginAnonymous } = useAuth();
  const inApp = isInAppBrowser();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await loginIdentifier(email, password);
      else await signupEmail(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onGuest() {
    setError(null);
    setBusy(true);
    try {
      await loginAnonymous();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Google blocks OAuth in embedded webviews (Messenger, Facebook…). When we're
  // inside one, steer the user to a real browser instead of redirecting (which
  // Google rejects with "Use secure browsers").
  async function openInBrowser() {
    const url = window.location.href;
    if (getPlatform() === "android") {
      const noScheme = url.replace(/^https?:\/\//, "");
      window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be blocked in webview — message still tells them to open a browser */
    }
    setError(t("da_sao_chep_lien_ket"));
  }

  async function onGoogle() {
    setError(null);
    if (inApp) {
      trackEvent("login_blocked_inapp", { method: "google" });
      await openInBrowser();
      return;
    }
    try {
      await loginGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col justify-center gap-6 overflow-y-auto bg-background px-6 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo.png" alt="" className="h-12 w-auto object-contain" />
        <h1 className="font-display text-4xl font-bold text-clay-600">Checkpoint</h1>
        <p className="text-muted-foreground">
          {t('kham_pha_the_gioi')}
          <br />
          {t('luu_dau_hanh_trinh')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type={mode === "signin" ? "text" : "email"}
          required
          autoCapitalize="none"
          autoComplete={mode === "signin" ? "username" : "email"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={mode === "signin" ? t('email_hoac_username') : "Email"}
          className="rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('mat_khau')}
          className="rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="px-2 text-sm text-accent-600">{error}</p>}
        <Button type="submit" size="lg" disabled={busy} icon={<Icon name="mail" size={20} />}>
          {busy ? t('dang_xu_ly') : mode === "signin" ? t('dang_nhap') : t('dang_ky')}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-subtle-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('hoac')}
        <span className="h-px flex-1 bg-border" />
      </div>

      {inApp && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p>{t('google_can_trinh_duyet')}</p>
          <Button variant="outline" size="sm" onClick={openInBrowser}>
            {t('mo_bang_trinh_duyet')}
          </Button>
        </div>
      )}

      <Button variant="outline" size="lg" onClick={onGoogle}>
        {t('tiep_tuc_voi_google')}
      </Button>

      <Button variant="ghost" size="lg" disabled={busy} onClick={onGuest}>
        {t('tiep_tuc_voi_khach')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? t('ban_chua_co_tai_khoan') : t('da_co_tai_khoan')}{" "}
        <button
          type="button"
          onClick={() => {
            const next = mode === "signin" ? "signup" : "signin";
            trackEvent("login_mode_change", { mode: next });
            setMode(next);
            setError(null);
          }}
          className="font-semibold text-primary"
        >
          {mode === "signin" ? t('dang_ky_ngay') : t('dang_nhap')}
        </button>
      </p>

      <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
        <p className="flex gap-3">
          <Link to="/privacy" className="hover:text-foreground hover:underline">{t('chinh_sach_bao_mat')}</Link>
          <Link to="/terms" className="hover:text-foreground hover:underline">{t('dieu_khoan_dich_vu')}</Link>
        </p>
        <p className="opacity-40">build {import.meta.env.VITE_APP_VERSION ?? "dev"}</p>
      </div>
    </div>
  );
}
