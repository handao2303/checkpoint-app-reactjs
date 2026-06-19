import { useState, type FormEvent } from "react";
import { Icon } from "../components/ui/Icon";
import { useAuth } from "../auth/AuthContext";
import { authErrorMessage } from "../lib/authErrors";
import { Button } from "../components/ui/Button";
import { trackEvent } from "../lib/observability";

export function LoginPage() {
  const { loginEmail, signupEmail, loginGoogle, loginAnonymous } = useAuth();
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
      if (mode === "signin") await loginEmail(email, password);
      else await signupEmail(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col justify-center gap-6 overflow-y-auto bg-background px-6 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo.png" alt="" className="h-12 w-auto object-contain" />
        <h1 className="font-display text-4xl font-bold text-clay-600">Checkpoint</h1>
        <p className="text-muted-foreground">
          Khám phá thế giới,
          <br />
          lưu dấu hành trình
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          className="rounded-full border border-border bg-surface px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="px-2 text-sm text-accent-600">{error}</p>}
        <Button type="submit" size="lg" disabled={busy} icon={<Icon name="mail" size={20} />}>
          {busy ? "Đang xử lý..." : mode === "signin" ? "Đăng nhập" : "Đăng ký"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-subtle-foreground">
        <span className="h-px flex-1 bg-border" />
        hoặc
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" size="lg" onClick={loginGoogle}>
        Tiếp tục với Google
      </Button>

      <button
        type="button"
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await loginAnonymous();
          } catch (err) {
            setError(authErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="text-center text-sm font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
      >
        Dùng thử không cần đăng nhập
      </button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? "Bạn chưa có tài khoản? " : "Đã có tài khoản? "}
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
          {mode === "signin" ? "Đăng ký ngay" : "Đăng nhập"}
        </button>
      </p>

      <p className="absolute bottom-4 inset-x-0 text-center text-xs text-muted-foreground opacity-40">
        build {import.meta.env.VITE_APP_VERSION ?? "dev"}
      </p>
    </div>
  );
}
