import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui/Icon";
import { UserAvatar } from "./ui/UserAvatar";
import { searchUsers, type PublicUserSummary } from "../lib/api";
import type { CommentMention } from "../lib/comments";

// Usernames are [a-z0-9_]; this matches the @token immediately before the caret.
const TOKEN_RE = /@(\w*)$/;

/** Comment input with @-mention autocomplete. Tracks the users actually picked so
 *  only real mentions (still present in the text) are reported on submit. */
export function CommentComposer({
  sending,
  onSubmit,
}: {
  sending: boolean;
  onSubmit: (text: string, mentions: CommentMention[]) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<CommentMention[]>([]);
  // The active @query (null when not typing a mention) and where its token starts.
  const [query, setQuery] = useState<string | null>(null);
  const [tokenStart, setTokenStart] = useState(0);
  const [results, setResults] = useState<PublicUserSummary[]>([]);

  // Debounced user search for the active @query.
  useEffect(() => {
    if (query === null || query.length < 1) {
      setResults([]);
      return;
    }
    let alive = true;
    const id = window.setTimeout(() => {
      searchUsers(query, 6)
        .then((users) => alive && setResults(users))
        .catch(() => alive && setResults([]));
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [query]);

  function syncToken(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = before.match(TOKEN_RE);
    if (m) {
      setQuery(m[1]);
      setTokenStart(caret - m[0].length);
    } else {
      setQuery(null);
    }
  }

  function onChange(value: string) {
    setText(value);
    syncToken(value, inputRef.current?.selectionStart ?? value.length);
  }

  function pick(user: PublicUserSummary) {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, tokenStart)}@${user.username} ${text.slice(caret)}`;
    setText(next);
    setPicked((cur) =>
      cur.some((m) => m.id === user.id)
        ? cur
        : [...cur, { id: user.id, username: user.username, display_name: user.display_name }],
    );
    setQuery(null);
    setResults([]);
    // Restore focus and place the caret right after the inserted mention.
    const pos = tokenStart + user.username.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    // Pass all picked users; comments.ts keeps only those still present in the text.
    try {
      await onSubmit(value, picked);
      setText("");
      setPicked([]);
      setQuery(null);
      setResults([]);
    } catch {
      // Leave the text so the user can retry.
    }
  }

  const showMenu = query !== null && query.length >= 1 && results.length > 0;

  return (
    <form onSubmit={submit} className="relative flex items-center gap-2">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyUp={(e) => syncToken(text, e.currentTarget.selectionStart ?? text.length)}
        onClick={(e) => syncToken(text, e.currentTarget.selectionStart ?? text.length)}
        onBlur={() => window.setTimeout(() => setQuery(null), 120)}
        maxLength={500}
        placeholder={t('viet_binh_luan')}
        className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        aria-label={t('gui')}
      >
        <Icon name="send" size={16} />
      </button>

      {showMenu && (
        <div className="absolute bottom-full left-0 z-30 mb-1 max-h-56 w-full max-w-xs overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              // onMouseDown (not onClick) so the pick fires before the input's onBlur.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted"
            >
              <UserAvatar
                src={u.avatar_url}
                name={u.display_name}
                username={u.username}
                className="h-7 w-7"
                fit="cover"
                fallbackClassName="h-6 w-6"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {u.display_name || u.username}
                </span>
                <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
