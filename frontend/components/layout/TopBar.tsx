"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, Flag, FlaskConical } from "lucide-react";
import { useFlags } from "@/hooks/useFlags";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/flags": "Flags",
  "/demo": "Demo",
  "/cluster": "Cluster",
  "/health": "Health",
};

function pageTitle(pathname: string): string {
  if (pathname === "/" ) return "Overview";
  if (pathname.startsWith("/flags/new")) return "New flag";
  if (pathname.startsWith("/flags/")) return "Flag detail";
  const match = Object.keys(PAGE_TITLES).find((p) => pathname.startsWith(p));
  return match ? PAGE_TITLES[match] : "FlagPlane";
}

function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Toggle theme" />}
      >
        <Sun className="h-4 w-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNav() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" />
        }
      >
        <Menu className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem render={<Link href="/flags" />}>
          <Flag className="h-4 w-4" /> Flags
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/demo" />}>
          <FlaskConical className="h-4 w-4" /> Demo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { data, isError, isSuccess } = useFlags();

  const connected = isSuccess && !isError;
  const configVersion = data?.config_version;

  return (
    <header
      className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-5 backdrop-blur md:px-8"
    >
      <MobileNav />

      <h1 className="text-sm font-semibold tracking-tight text-foreground">
        {pageTitle(pathname)}
      </h1>

      <div className="ml-auto flex items-center gap-2.5">
        {/* Environment */}
        <span className="hidden items-center rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
          local
        </span>

        {/* Global config version — the live heartbeat of the control plane */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground sm:inline-flex"
                aria-live="polite"
              />
            }
          >
            config{" "}
            <span className="text-foreground">
              v{configVersion ?? "—"}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Global config version — bumps on every committed change
          </TooltipContent>
        </Tooltip>

        {/* Live status (real) */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium"
                aria-live="polite"
              />
            }
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-success" : "bg-destructive"
              )}
            />
            <span className={connected ? "text-foreground" : "text-destructive"}>
              {connected ? "Live" : "Offline"}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {connected
              ? "Connected to the control plane"
              : "Cannot reach the API at :8080"}
          </TooltipContent>
        </Tooltip>

        <ThemeToggle />
      </div>
    </header>
  );
}
