"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Flag, Layout, Play, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Layout },
  { href: "/flags", label: "Flags", icon: Flag },
  { href: "/demo", label: "Demo", icon: Play },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/50 bg-sidebar/50 backdrop-blur-sm md:block">
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold uppercase tracking-wider transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 rounded-lg border border-primary/30 bg-primary/10"
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                />
              )}
              {isActive && (
                <motion.div
                  layoutId="activeNavGlow"
                  className="absolute -left-px top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                />
              )}
              <item.icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10 text-xs">{item.label}</span>
              {isActive && (
                <Star className="relative z-10 ml-auto h-3 w-3 text-primary/50" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Decorative bottom element */}
      <div className="mt-auto px-4 pb-4">
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            v1.0 Neon Sakura
          </p>
        </div>
      </div>
    </aside>
  );
}
