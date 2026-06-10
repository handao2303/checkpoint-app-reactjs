import { useEffect } from "react";

/** Transient top toast that auto-dismisses. */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-x-0 top-16 z-50 mx-auto w-fit rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      {message}
    </div>
  );
}
