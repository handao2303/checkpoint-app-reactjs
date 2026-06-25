import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { searchUsers } from "../../lib/api";
import { getOrCreateDMRoom } from "../../lib/chat";
import { Sheet } from "../ui/Sheet";
import { UserAvatar } from "../ui/UserAvatar";
import { Icon } from "../ui/Icon";
import { CreateGroupSheet } from "./CreateGroupSheet";
import { trackEvent } from "../../lib/observability";

interface UserResult {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export function NewChatSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleSearch(q: string) {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchUsers(q.trim());
        setResults(res.filter((u) => u.id !== user?.id));
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function handleStartDM(partnerId: string) {
    if (!user) return;
    trackEvent("chat_dm_start", { partner_id: partnerId });
    const roomId = await getOrCreateDMRoom(
      user.id,
      user.display_name || user.username,
      partnerId,
    );
    onClose();
    navigate(`/chat/${encodeURIComponent(roomId)}`);
  }

  return (
    <Sheet title={t("tin_nhan_moi")} onClose={onClose}>
      <div className="flex flex-col gap-4 py-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <Icon name="search" size={18} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("tim_theo_ten_hoac_username")}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        {searching && (
          <p className="text-center text-xs text-muted-foreground">{t("dang_tim")}</p>
        )}

        {results.length > 0 && (
          <div className="flex flex-col">
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => handleStartDM(u.id)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-surface-muted"
              >
                <UserAvatar
                  src={u.avatar_url}
                  name={u.display_name || u.username}
                  username={u.username}
                  className="h-10 w-10"
                  fallbackClassName="h-9 w-9"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.display_name || u.username}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {query && !searching && results.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {t("khong_tim_thay_nguoi_dung")}
          </p>
        )}

        <hr className="border-border" />

        <button
          type="button"
          onClick={() => setShowCreateGroup(true)}
          className="flex items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary/30 bg-primary/5 py-3 text-sm font-bold text-primary transition hover:border-primary/60 hover:bg-primary/10"
        >
          <Icon name="friends" size={18} />
          {t("tao_nhom_chat")}
        </button>
      </div>

      {showCreateGroup && (
        <CreateGroupSheet onClose={() => setShowCreateGroup(false)} />
      )}
    </Sheet>
  );
}
