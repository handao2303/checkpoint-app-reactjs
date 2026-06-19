import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { cn } from "../../lib/cn";
import { useNavTabs } from "./navTabs";

/**
 * Mobile-browser navigation: a menu button that expands into a dropdown list of
 * the nav tabs. Desktop uses the inline TopNav instead.
 */
export function NavMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { tabs, labelOf, handleTabClick } = useNavTabs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("menu")}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-full p-2 text-clay-600 hover:bg-surface-muted"
      >
        <Icon name={open ? "x" : "list"} size={22} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-lg"
        >
          {tabs.map((tab) => {
            const label = labelOf(tab);
            return (
              <li key={tab.to} role="none">
                <NavLink
                  to={tab.to}
                  end={tab.to === "/"}
                  role="menuitem"
                  onClick={(e) => {
                    handleTabClick(tab, e, "top_nav_menu");
                    setOpen(false);
                  }}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors",
                      isActive
                        ? "bg-primary-50 text-primary"
                        : "text-foreground hover:bg-surface-muted",
                    )
                  }
                >
                  <Icon name={tab.icon} size={20} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
