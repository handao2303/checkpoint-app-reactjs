import { useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Icon } from "../ui/Icon";

interface ChatInputProps {
  onSend: (text: string) => void | Promise<void>;
  onPickImage?: (file: File) => void;
  disabled?: boolean;
  uploadingImage?: boolean;
}

export function ChatInput({ onSend, onPickImage, disabled, uploadingImage }: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    try {
      await onSend(trimmed);
    } finally {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleFileChange() {
    const file = fileRef.current?.files?.[0];
    if (file && onPickImage) {
      onPickImage(file);
      // Reset so the same file can be picked again
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-border bg-surface px-3 py-2"
    >
      {onPickImage && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploadingImage}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
            aria-label="Gửi ảnh"
          >
            {uploadingImage ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            ) : (
              <Icon name="image" size={22} />
            )}
          </button>
        </>
      )}

      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nhập tin nhắn..."
        disabled={disabled || uploadingImage}
        autoComplete="off"
        className="min-w-0 flex-1 rounded-2xl bg-surface-muted px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-40"
      />

      <button
        type="submit"
        disabled={disabled || uploadingImage || !text.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 disabled:opacity-30"
        aria-label="Gửi"
      >
        <Icon name="send" size={20} />
      </button>
    </form>
  );
}
