import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { authErrorMessage } from "../lib/authErrors";
import { Button } from "./ui/Button";

/** Shown to anonymous users: convert the guest session into a real account
 *  without losing data (Supabase keeps the same user id). */
export function UpgradeBanner() {
  const { t } = useTranslation();
  const { upgradeAccount, loginGoogle } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await upgradeAccount(email, password);
      setMsg(t('da_luu_neu_bat_xac'));
    } catch (err) {
      setMsg(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-clay-700">
      <p>
        Bạn đang dùng <b>{t('tai_khoan_khach')}</b> — dữ liệu có thể mất. Tạo tài khoản để lưu hành trình
        {t('giu_nguyen_hien_co')}
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-2 font-semibold text-primary">
          {t('tao_tai_khoan')}
        </button>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-full border border-border bg-surface px-4 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('mat_khau')}
            className="rounded-full border border-border bg-surface px-4 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t('dang_luu') : t('luu_tai_khoan')}
          </Button>
          <button
            type="button"
            onClick={() => {
              loginGoogle().catch((err) => setMsg(authErrorMessage(err)));
            }}
            className="text-center text-sm font-medium text-primary"
          >
            {t('hoac_lien_ket_google')}
          </button>
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        </form>
      )}
    </div>
  );
}
