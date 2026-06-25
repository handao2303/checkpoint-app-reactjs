import i18n from "./i18n";
// Translate Supabase auth errors (English) into Vietnamese, by error code first
// (stable across versions) then by message text (fallback for older SDKs).
//
// Maps hold i18n *keys*, not resolved strings — resolve with `i18n.t()` at call
// time so the message follows the current language (the function runs at
// error-handling time, not at module load).

const KEY_BY_CODE: Record<string, string> = {
  invalid_credentials: 'email_hoac_mat_khau_khong',
  email_not_confirmed: 'email_chua_duoc_xac_nhan',
  user_already_exists: 'email_nay_da_duoc_dang',
  email_exists: 'email_nay_da_duoc_dang',
  weak_password: 'mat_khau_qua_yeu_can',
  anonymous_provider_disabled: 'dang_nhap_khach_dang_tat',
  signup_disabled: 'dang_ky_hien_dang_bi',
  signups_not_allowed: 'dang_ky_hien_dang_bi',
  provider_disabled: 'phuong_thuc_dang_nhap_nay',
  over_email_send_rate_limit: 'gui_email_qua_nhieu_lan',
  over_request_rate_limit: 'ban_thao_tac_qua_nhanh',
  validation_failed: 'thong_tin_nhap_vao_khong',
  email_address_invalid: 'dia_chi_email_khong_hop',
  same_password: 'mat_khau_moi_phai_khac',
  session_not_found: 'phien_da_het_han_vui',
  refresh_token_not_found: 'phien_da_het_han_vui',
  user_banned: 'tai_khoan_da_bi_khoa',
  captcha_failed: 'xac_thuc_captcha_that_bai',
  email_address_not_authorized: 'email_nay_khong_duoc_phep',
  identity_already_exists: 'tai_khoan_google_nay_da',
  manual_linking_disabled: 'lien_ket_tai_khoan_dang',
};

const KEY_BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, KEY_BY_CODE.invalid_credentials],
  [/email not confirmed/i, KEY_BY_CODE.email_not_confirmed],
  [/already (registered|been registered)|user already exists/i, KEY_BY_CODE.user_already_exists],
  [/password should be at least/i, KEY_BY_CODE.weak_password],
  [/anonymous sign-?ins are disabled/i, KEY_BY_CODE.anonymous_provider_disabled],
  [/signups? (not allowed|are disabled)/i, KEY_BY_CODE.signup_disabled],
  [/rate limit|too many requests/i, KEY_BY_CODE.over_request_rate_limit],
  [/unable to validate email|invalid format|invalid email/i, KEY_BY_CODE.email_address_invalid],
  [/new password should be different/i, KEY_BY_CODE.same_password],
  [/network|failed to fetch|load failed/i, 'khong_ket_noi_duoc_may'],
];

/** Best-effort localized message for any auth/login error. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null | undefined)?.code;
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (code && KEY_BY_CODE[code]) return i18n.t(KEY_BY_CODE[code]);
  for (const [re, key] of KEY_BY_MESSAGE) if (re.test(message)) return i18n.t(key);

  // Our own already-Vietnamese messages contain diacritics (non-ASCII) — keep them.
  if (/[^\x00-\x7F]/.test(message)) return message;

  return i18n.t('co_loi_xay_ra_vui');
}
