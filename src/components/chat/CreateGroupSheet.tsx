import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { getUploadSlots, putFilesToSlots, searchUsers } from "../../lib/api";
import { createGroupRoom } from "../../lib/chat";
import { Sheet } from "../ui/Sheet";
import { UserAvatar } from "../ui/UserAvatar";
import { Icon } from "../ui/Icon";
import { trackEvent } from "../../lib/observability";

interface UserResult {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export function CreateGroupSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [members, setMembers] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
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
        setResults(
          res.filter(
            (u) => u.id !== user?.id && !members.find((m) => m.id === u.id),
          ),
        );
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function handleAddMember(u: UserResult) {
    setMembers((prev) => [...prev, u]);
    setResults((prev) => prev.filter((r) => r.id !== u.id));
    setQuery("");
  }

  function handleRemoveMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function handleAvatarChange() {
    const file = avatarRef.current?.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  }

  async function handleCreate() {
    if (!user || !name.trim() || members.length === 0 || creating) return;
    setCreating(true);
    try {
      // Upload avatar if picked
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const slots = await getUploadSlots(["image"]);
        await putFilesToSlots(slots, [{ original: avatarFile, type: "image" }]);
        avatarUrl = `https://media.checkpoint-app.space/${slots[0].object_key}`;
      }

      const allIds = [user.id, ...members.map((m) => m.id)];
      trackEvent("chat_group_create", { member_count: allIds.length });
      const roomId = await createGroupRoom(user.id, name.trim(), allIds, avatarUrl);
      onClose();
      navigate(`/chat/${encodeURIComponent(roomId)}`);
    } catch {
      // best-effort
    } finally {
      setCreating(false);
    }
  }

  return (
    <Sheet title={t("tao_nhom_chat")} onClose={onClose}>
      <div className="flex flex-col gap-4 py-4">
        {/* Avatar picker */}
        <div className="flex flex-col items-center gap-2">
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => avatarRef.current?.click()}
            className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-surface-muted transition hover:border-primary/40"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="camera" size={24} className="text-muted-foreground" />
            )}
          </button>
          <span className="text-xs text-muted-foreground">{t("them_anh_dai_dien")}</span>
        </div>

        {/* Group name */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("ten_nhom")}
          autoFocus
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        {/* Selected members */}
        {members.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-sm"
              >
                <span className="max-w-[100px] truncate font-medium">
                  {m.display_name || m.username}
                </span>
                <button
                  onClick={() => handleRemoveMember(m.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  aria-label={t("xoa")}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Member search */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <Icon name="search" size={18} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("them_thanh_vien")}
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
                onClick={() => handleAddMember(u)}
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
                <Icon name="plus" size={16} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!name.trim() || members.length === 0 || creating}
          className="rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground shadow-cta transition hover:brightness-105 disabled:opacity-40"
        >
          {creating ? t("dang_tai") : t("tao_nhom", { count: members.length + 1 })}
        </button>
      </div>
    </Sheet>
  );
}
