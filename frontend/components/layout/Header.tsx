"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const { setTheme } = useTheme();

  return (
    <header className="anime-accent-line sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-14 items-center">
        <Link href="/" className="group flex items-center gap-2.5 font-semibold tracking-wide">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="absolute inset-0 rounded-lg bg-primary/10 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <span className="text-lg font-bold uppercase tracking-widest text-foreground">
            Fla<span className="text-primary">g</span>s
          </span>
        </Link>

        <nav className="ml-8 hidden items-center gap-1 md:flex">
          <Link href="/flags">
            <Button variant="ghost" size="sm" className="font-semibold uppercase tracking-wider text-xs">
              Flags
            </Button>
          </Link>
          <Link href="/demo">
            <Button variant="ghost" size="sm" className="font-semibold uppercase tracking-wider text-xs">
              Demo
            </Button>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="md:hidden" />}
            >
              <Menu className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href="/flags" />}>
                Flags
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/demo" />}>
                Demo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
