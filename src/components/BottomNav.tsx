import { NavLink } from "react-router-dom";
import { Icon } from "./ui/Icon";
import { cn } from "../lib/cn";
import { useNavTabs } from "./nav/navTabs";

export function BottomNav() {
  const { tabs, labelOf, handleTabClick } = useNavTabs();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-center px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        {tabs.map((tab) => {
          const { to, icon, tone } = tab;
          const label = labelOf(tab);
          return (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={to === "/"}
                className="flex min-w-0 justify-center"
                aria-label={label}
                title={label}
                onClick={(e) => handleTabClick(tab, e, "bottom_nav")}
              >
                {({ isActive }) => (
                  <span
                    className={cn(
                      "flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 py-1.5 text-[10px] font-semibold leading-none transition-colors sm:text-xs",
                      isActive
                        ? tone === "green"
                          ? "bg-green-50 text-secondary"
                          : "bg-primary-50 text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon name={icon} size={22} strokeWidth={isActive ? 2.4 : 2.1} className="shrink-0" />
                    <span className="block max-w-full truncate whitespace-nowrap">{label}</span>
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
