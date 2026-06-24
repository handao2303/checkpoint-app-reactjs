import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { getUploadSlots, putFilesToSlots, searchUsers } from "../../lib/api";
import { updateGroupRoom } from "../../lib/chat";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
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

interface Props {
  roomId: string;
  onClose: () => void;
}

export function EditGroupSheet({ roomId, onClose }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [members, setMembers] = useState<UserResult[]>([]);
  const [existingAvatar, setExistingAvatar] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const avatarRef = useRef<HTMLInputElement>(null);

  // Load existing room data
  useEffect(() => {
    getDoc(doc(db, "rooms", roomId)).then((snap) => {
      if (!snap.exists()) return;
      const room = snap.data();
      setName(room.name || "");
      setExistingAvatar(room.avatar_url || null);
      // Resolve member snapshots
      const names = room.member_names as Record<string, string> || {};
      const memberList = (room.members as string[]) || [];
      setMembers(
        memberList
          .filter((id) => id !== user?.id)
          .map((id) => ({
            id,
            username: names[id] || id,
            display_name: names[id],
          })),
      );
      setLoaded(true);
    });
  }, [roomId, user]);

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
    setAvatarPreview(URL.createObjectURL(file));
  }

  function handleRemoveAvatar() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setExistingAvatar(null);
  }

  async function handleSave() {
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    try {
      // Upload new avatar if picked
      let avatarUrl: string | null | undefined;
      if (avatarFile) {
        const slots = await getUploadSlots(["image"]);
        await putFilesToSlots(slots, [{ original: avatarFile, type: "image" }]);
        avatarUrl = `https://media.checkpoint-app.space/${slots[0].object_key}`;
      } else if (existingAvatar === null && !avatarFile) {
        avatarUrl = null;
      }

      // Compute member changes
      const currentIds = members.map((m) => m.id);
      const snap = await getDoc(doc(db, "rooms", roomId));
      const room = snap.data();
      const oldMembers: string[] = (room?.members || []).filter((id: string) => id !== user?.id);
      const addMembers = currentIds.filter((id) => !oldMembers.includes(id));
      const removeMembers = oldMembers.filter((id) => !currentIds.includes(id));

      await updateGroupRoom(roomId, {
        name: name !== room?.name ? name : undefined,
        avatar_url: avatarUrl,
        addMembers: addMembers.length > 0 ? addMembers : undefined,
        removeMembers: removeMembers.length > 0 ? removeMembers : undefined,
      });

      trackEvent("chat_group_edit_saved", { room_id: roomId });
      onClose();
    } catch {
      // best-effort
    } finally {
      setSaving(false);
    }
  }

  const previewUrl = avatarPreview || existingAvatar;

  return (
    <Sheet title={t("sua_nhom_chat")} onClose={onClose}>
      {!loaded ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("dang_tai")}</p>
      ) : (
        <div className="flex flex-col gap-4 py-4">
          {/* Avatar */}
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
              {previewUrl ? (
                <img src={previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon name="camera" size={24} className="text-muted-foreground" />
              )}
            </button>
            {previewUrl && (
              <button
                onClick={handleRemoveAvatar}
                className="text-xs text-accent-600"
              >
                {t("xoa_anh")}
              </button>
            )}
            {!previewUrl && (
              <span className="text-xs text-muted-foreground">{t("them_anh_dai_dien")}</span>
            )}
          </div>

          {/* Name */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("ten_nhom")}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Current members */}
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

          {/* Add member search */}
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

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground shadow-cta transition hover:brightness-105 disabled:opacity-40"
          >
            {saving ? t("dang_luu") : t("luu_thay_doi")}
          </button>
        </div>
      )}
    </Sheet>
  );
}
