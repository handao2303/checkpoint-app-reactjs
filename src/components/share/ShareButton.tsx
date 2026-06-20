import { useTranslation } from "react-i18next";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { useAuth } from "../../auth/AuthContext";
import { shareLink } from "../../lib/share";
import { trackError, trackEvent } from "../../lib/observability";

/** Shares a deep link (with OG meta) via the native share sheet. Only rendered
 *  for signed-in users; no image card is generated. */
export function ShareButton({
  title,
  text,
  url,
  label,
}: {
  title: string;
  text: string;
  /** Deep link back to the item (shared as the Web Share `url`). */
  url?: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null; // don't show the share button to anonymous users

  const resolvedLabel = label ?? t('chia_se');

  const onShare = async () => {
    trackEvent("share_click");
    try {
      await shareLink({ title, text, url });
    } catch (error) {
      trackError(error, { feature: "share", action: "share_link" });
    }
  };

  return (
    <Button variant="green" icon={<Icon name="share" size={20} />} onClick={onShare} className="w-full">
      {resolvedLabel}
    </Button>
  );
}
