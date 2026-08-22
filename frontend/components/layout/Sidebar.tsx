"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, FlaskConical, Boxes, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Flag;
  status?: "live" | "soon";
};

// Flags + Demo + Cluster + Health are live. Chaos (W4) lands with its phase.
const navItems: NavItem[] = [
  { href: "/flags", label: "Flags", icon: Flag, status: "live" },
  { href: "/demo", label: "Demo", icon: FlaskConical, status: "live" },
  { href: "/cluster", label: "Cluster", icon: Boxes, status: "live" },
  { href: "/health", label: "Health", icon: Activity, status: "live" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      {/* Brand */}
      <Link
        href="/flags"
        className="flex h-14 items-center gap-2.5 border-b border-border px-5"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Flag className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          FlagPlane
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="px-2 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Control plane
        </p>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const isSoon = item.status === "soon";
          const content = (
            <>
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
                strokeWidth={2}
              />
              <span className="truncate">{item.label}</span>
              {isSoon && (
                <span className="ml-auto rounded-full border border-border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  soon
                </span>
              )}
            </>
          );

          if (isSoon) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                title="Ships with its phase of the roadmap"
                className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground/70"
              >
                {content}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
              )}
              {content}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Self-hosted · Go + Postgres + Redis
        </p>
      </div>
    </aside>
  );
}
