import { NavLink } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { cn } from "../../lib/cn";
import { useNavTabs } from "./navTabs";

/**
 * Inline horizontal navigation for the desktop browser header (md+). Mobile
 * browsers use NavMenu (a dropdown) instead.
 */
export function TopNav({ className }: { className?: string }) {
  const { tabs, labelOf, handleTabClick } = useNavTabs();

  return (
    <nav className={className}>
      <ul className="flex items-center gap-1">
        {tabs.map((tab) => {
          const { to, icon, tone } = tab;
          const label = labelOf(tab);
          return (
            <li key={to}>
              <NavLink
                to={to}
                end={to === "/"}
                className="flex min-w-0 justify-center"
                aria-label={label}
                title={label}
                onClick={(e) => handleTabClick(tab, e, "top_nav")}
              >
                {({ isActive }) => (
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors",
                      isActive
                        ? tone === "green"
                          ? "bg-green-50 text-secondary"
                          : "bg-primary-50 text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon name={icon} size={20} strokeWidth={isActive ? 2.4 : 2.1} className="shrink-0" />
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
