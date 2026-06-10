// Translate Supabase auth errors (English) into Vietnamese, by error code first
// (stable across versions) then by message text (fallback for older SDKs).

const BY_CODE: Record<string, string> = {
  invalid_credentials: "Email hoặc mật khẩu không đúng.",
  email_not_confirmed: "Email chưa được xác nhận. Vui lòng kiểm tra hộp thư của bạn.",
  user_already_exists: "Email này đã được đăng ký. Hãy đăng nhập.",
  email_exists: "Email này đã được đăng ký. Hãy đăng nhập.",
  weak_password: "Mật khẩu quá yếu — cần ít nhất 6 ký tự.",
  anonymous_provider_disabled: "Đăng nhập khách đang tắt. Bật trong Supabase → Authentication.",
  signup_disabled: "Đăng ký hiện đang bị tắt.",
  signups_not_allowed: "Đăng ký hiện đang bị tắt.",
  provider_disabled: "Phương thức đăng nhập này đang bị tắt.",
  over_email_send_rate_limit: "Gửi email quá nhiều lần. Vui lòng thử lại sau ít phút.",
  over_request_rate_limit: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  validation_failed: "Thông tin nhập vào không hợp lệ.",
  email_address_invalid: "Địa chỉ email không hợp lệ.",
  same_password: "Mật khẩu mới phải khác mật khẩu hiện tại.",
  session_not_found: "Phiên đã hết hạn. Vui lòng đăng nhập lại.",
  refresh_token_not_found: "Phiên đã hết hạn. Vui lòng đăng nhập lại.",
  user_banned: "Tài khoản đã bị khoá.",
  captcha_failed: "Xác thực captcha thất bại. Vui lòng thử lại.",
  email_address_not_authorized: "Email này không được phép đăng nhập.",
  identity_already_exists: "Tài khoản Google này đã được dùng cho tài khoản khác. Hãy đăng nhập trực tiếp.",
  manual_linking_disabled: "Liên kết tài khoản đang bị tắt trong cấu hình Supabase.",
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
  [/network|failed to fetch|load failed/i, "Không kết nối được máy chủ. Kiểm tra kết nối mạng."],
];

/** Best-effort Vietnamese message for any auth/login error. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null | undefined)?.code;
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (code && BY_CODE[code]) return BY_CODE[code];
  for (const [re, vi] of BY_MESSAGE) if (re.test(message)) return vi;

  // Our own already-Vietnamese messages contain diacritics (non-ASCII) — keep them.
  if (/[^\x00-\x7F]/.test(message)) return message;

  return "Có lỗi xảy ra. Vui lòng thử lại.";
}
