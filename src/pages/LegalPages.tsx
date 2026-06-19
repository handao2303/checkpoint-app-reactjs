import { Link } from "react-router-dom";
import type { ReactNode } from "react";

// Public, no-auth legal pages used for the Google OAuth verification (Google
// Photos / Drive scopes) and linked from the app footer. Served via the SPA
// fallback, so https://checkpoint-app.space/privacy and /terms work as direct
// links for reviewers.

const CONTACT_EMAIL = "uitbestteam@gmail.com"; // đổi thành email hỗ trợ nếu cần
const LAST_UPDATED = "19/06/2026";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-full max-w-2xl bg-background px-5 py-8 text-foreground">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-9 w-auto object-contain" />
          <span className="font-display text-xl font-bold text-clay-600">Checkpoint</span>
        </Link>
      </header>
      <h1 className="mb-1 font-display text-2xl font-extrabold">{title}</h1>
      <p className="mb-6 text-xs text-muted-foreground">Cập nhật lần cuối: {LAST_UPDATED}</p>
      <div className="space-y-5 text-sm leading-relaxed text-foreground/90">{children}</div>
      <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-5 text-sm">
        <Link to="/" className="text-primary hover:underline">Trang chủ</Link>
        <Link to="/privacy" className="text-primary hover:underline">Chính sách bảo mật</Link>
        <Link to="/terms" className="text-primary hover:underline">Điều khoản dịch vụ</Link>
      </footer>
    </div>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 font-display text-base font-bold text-foreground">{children}</h2>;
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Chính sách bảo mật">
      <p>
        Checkpoint là ứng dụng du lịch xã hội giúp bạn check-in địa điểm, lưu hành trình và chia sẻ
        khoảnh khắc. Chính sách này mô tả dữ liệu chúng tôi thu thập, cách sử dụng và quyền của bạn.
      </p>

      <H>1. Thông tin chúng tôi thu thập</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Tài khoản:</b> email, tên hiển thị, ảnh đại diện (qua đăng nhập email hoặc Google).</li>
        <li><b>Vị trí:</b> toạ độ GPS khi bạn chủ động check-in (không theo dõi nền).</li>
        <li><b>Nội dung của bạn:</b> ảnh/video, ghi chú, đánh giá, hành trình bạn tạo.</li>
        <li>
          <b>Dữ liệu Google (tuỳ chọn):</b> nếu bạn bật đồng bộ, chúng tôi truy cập Google Drive và/hoặc
          Google Photos của bạn <i>chỉ để</i> tải ảnh/video check-in của chính bạn lên thư viện của bạn.
        </li>
      </ul>

      <H>2. Cách chúng tôi sử dụng dữ liệu</H>
      <p>
        Dữ liệu được dùng để vận hành tính năng cốt lõi: hiển thị check-in trên bản đồ, tính XP/cấp độ,
        gợi ý địa điểm gần bạn, và đồng bộ ảnh sang Google Drive/Photos khi bạn yêu cầu. Chúng tôi
        <b> không bán</b> dữ liệu và <b>không dùng</b> dữ liệu cho quảng cáo.
      </p>

      <H>3. Dữ liệu Google API — Giới hạn sử dụng (Limited Use)</H>
      <p>
        Việc Checkpoint sử dụng và chuyển giao thông tin nhận được từ Google API tuân thủ{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Google API Services User Data Policy
        </a>
        , bao gồm các yêu cầu Giới hạn sử dụng (Limited Use).
      </p>
      <p className="rounded-lg bg-surface-muted p-3 text-xs">
        Checkpoint's use and transfer to any other app of information received from Google APIs will
        adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>
        Cụ thể: dữ liệu Google Drive/Photos chỉ dùng để cung cấp tính năng đồng bộ ảnh do bạn bật;
        không chuyển cho bên thứ ba (trừ khi cần để cung cấp tính năng hoặc theo luật); không dùng cho
        quảng cáo; và con người không đọc dữ liệu này trừ khi bạn đồng ý, để hỗ trợ/khắc phục sự cố, hoặc
        theo yêu cầu pháp lý.
      </p>

      <H>4. Lưu trữ, chia sẻ &amp; bên thứ ba</H>
      <p>
        Chúng tôi dùng Supabase (xác thực &amp; cơ sở dữ liệu), Cloudflare R2 (lưu ảnh/video) và
        Firebase Firestore (bình luận). Ảnh đồng bộ được lưu trong tài khoản Google của chính bạn.
      </p>

      <H>5. Quyền của bạn &amp; thu hồi truy cập</H>
      <p>
        Bạn có thể chỉnh sửa hồ sơ, xoá check-in, hoặc xoá tài khoản trong ứng dụng. Bạn có thể thu hồi
        quyền truy cập Google bất cứ lúc nào tại{" "}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          myaccount.google.com/permissions
        </a>{" "}
        hoặc trong mục “Tích hợp” của ứng dụng.
      </p>

      <H>6. Liên hệ</H>
      <p>
        Mọi thắc mắc về quyền riêng tư, liên hệ:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Điều khoản dịch vụ">
      <p>
        Bằng việc sử dụng Checkpoint, bạn đồng ý với các điều khoản dưới đây. Nếu không đồng ý, vui lòng
        ngừng sử dụng dịch vụ.
      </p>

      <H>1. Tài khoản</H>
      <p>
        Bạn chịu trách nhiệm bảo mật tài khoản và mọi hoạt động dưới tài khoản của mình. Bạn phải cung
        cấp thông tin chính xác khi đăng ký.
      </p>

      <H>2. Nội dung của bạn</H>
      <p>
        Bạn giữ quyền sở hữu nội dung mình đăng (ảnh, ghi chú, hành trình). Bạn cấp cho Checkpoint quyền
        hiển thị nội dung đó trong ứng dụng nhằm cung cấp dịch vụ. Bạn không đăng nội dung vi phạm pháp
        luật, xâm phạm quyền người khác, hoặc nội dung độc hại.
      </p>

      <H>3. Sử dụng hợp lệ</H>
      <p>
        Không lạm dụng, can thiệp, dò quét hoặc làm gián đoạn dịch vụ; không dùng cho mục đích trái pháp
        luật.
      </p>

      <H>4. Dịch vụ bên thứ ba</H>
      <p>
        Tính năng đồng bộ dùng Google Drive/Photos và tuân thủ chính sách của Google. Việc bạn dùng
        các dịch vụ bên thứ ba còn chịu điều khoản riêng của họ.
      </p>

      <H>5. Miễn trừ &amp; giới hạn trách nhiệm</H>
      <p>
        Dịch vụ được cung cấp “nguyên trạng”, không bảo đảm không gián đoạn hay không lỗi. Trong phạm vi
        pháp luật cho phép, Checkpoint không chịu trách nhiệm cho thiệt hại gián tiếp phát sinh từ việc
        sử dụng dịch vụ.
      </p>

      <H>6. Thay đổi điều khoản</H>
      <p>
        Chúng tôi có thể cập nhật điều khoản này; bản cập nhật có hiệu lực khi đăng tải. Việc tiếp tục sử
        dụng đồng nghĩa bạn chấp nhận thay đổi.
      </p>

      <H>7. Liên hệ</H>
      <p>
        Liên hệ:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
