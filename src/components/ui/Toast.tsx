import { useEffect } from "react";

/** Transient top toast that auto-dismisses. */
export function Toast({
  message,
  onDone,
  onClick,
}: {
  message: string;
  onDone: () => void;
  onClick?: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  const className =
    "fixed inset-x-0 top-16 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-lg";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} cursor-pointer text-left hover:brightness-105`}>
        {message}
      </button>
    );
  }

  return (
    <div className={className}>{message}</div>
  );
}
