import { t } from "./i18n";
// Translate Supabase auth errors (English) into Vietnamese, by error code first
// (stable across versions) then by message text (fallback for older SDKs).

const BY_CODE: Record<string, string> = {
  invalid_credentials: t('email_hoac_mat_khau_khong'),
  email_not_confirmed: t('email_chua_duoc_xac_nhan'),
  user_already_exists: t('email_nay_da_duoc_dang'),
  email_exists: t('email_nay_da_duoc_dang'),
  weak_password: t('mat_khau_qua_yeu_can'),
  anonymous_provider_disabled: t('dang_nhap_khach_dang_tat'),
  signup_disabled: t('dang_ky_hien_dang_bi'),
  signups_not_allowed: t('dang_ky_hien_dang_bi'),
  provider_disabled: t('phuong_thuc_dang_nhap_nay'),
  over_email_send_rate_limit: t('gui_email_qua_nhieu_lan'),
  over_request_rate_limit: t('ban_thao_tac_qua_nhanh'),
  validation_failed: t('thong_tin_nhap_vao_khong'),
  email_address_invalid: t('dia_chi_email_khong_hop'),
  same_password: t('mat_khau_moi_phai_khac'),
  session_not_found: t('phien_da_het_han_vui'),
  refresh_token_not_found: t('phien_da_het_han_vui'),
  user_banned: t('tai_khoan_da_bi_khoa'),
  captcha_failed: t('xac_thuc_captcha_that_bai'),
  email_address_not_authorized: t('email_nay_khong_duoc_phep'),
  identity_already_exists: t('tai_khoan_google_nay_da'),
  manual_linking_disabled: t('lien_ket_tai_khoan_dang'),
};

const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/already (registered|been registered)|user already exists/i, BY_CODE.user_already_exists],
  [/password should be at least/i, BY_CODE.weak_password],
  [/anonymous sign-?ins are disabled/i, BY_CODE.anonymous_provider_disabled],
  [/signups? (not allowed|are disabled)/i, BY_CODE.signup_disabled],
  [/rate limit|too many requests/i, BY_CODE.over_request_rate_limit],
  [/unable to validate email|invalid format|invalid email/i, BY_CODE.email_address_invalid],
  [/new password should be different/i, BY_CODE.same_password],
  [/network|failed to fetch|load failed/i, t('khong_ket_noi_duoc_may')],
];

/** Best-effort Vietnamese message for any auth/login error. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null | undefined)?.code;
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (code && BY_CODE[code]) return BY_CODE[code];
  for (const [re, vi] of BY_MESSAGE) if (re.test(message)) return vi;

  // Our own already-Vietnamese messages contain diacritics (non-ASCII) — keep them.
  if (/[^\x00-\x7F]/.test(message)) return message;

  return t('co_loi_xay_ra_vui');
}
