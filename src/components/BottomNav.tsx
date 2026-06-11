import { NavLink } from "react-router-dom";
import { Map, Compass, PlusCircle, Bot, User, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

type Tab = {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Active highlight color, mirroring the mockups (Map = orange, AI Plan = green). */
  tone: "primary" | "green";
};

const tabs: Tab[] = [
  { to: "/", label: "Map", Icon: Map, tone: "primary" },
  { to: "/discover", label: "Discover", Icon: Compass, tone: "primary" },
  { to: "/create", label: "Create", Icon: PlusCircle, tone: "primary" },
  { to: "/ai-plan", label: "AI Plan", Icon: Bot, tone: "green" },
  { to: "/profile", label: "Profile", Icon: User, tone: "primary" },
];

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        {tabs.map(({ to, label, Icon, tone }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              className="block"
              aria-label={label}
            >
              {({ isActive }) => (
                <span
                  className={cn(
                    "flex min-w-16 flex-col items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    isActive
                      ? tone === "green"
                        ? "text-secondary"
                        : "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                  {label}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
