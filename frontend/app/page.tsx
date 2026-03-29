"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Flag, Play, ArrowRight, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { pageTransition, defaultTransition, staggerContainer, staggerItem } from "@/components/motion/variants";

export default function HomePage() {
  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
      className="space-y-8"
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-neon-cyan/5 p-8">
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
          </div>
          <h1 className="text-4xl font-bold uppercase tracking-wider">
            Dash<span className="text-primary">board</span>
          </h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Manage your feature flags and test them in the demo app
          </p>
        </div>

        {/* Decorative corner stars */}
        <Star className="absolute right-6 top-6 h-4 w-4 text-primary/20 anime-float" />
        <Star className="absolute right-16 top-12 h-3 w-3 text-neon-cyan/20 anime-float" style={{ animationDelay: "1s" }} />
      </div>

      {/* Action Cards */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid gap-4 md:grid-cols-2"
      >
        <motion.div variants={staggerItem}>
          <Card className="group relative overflow-hidden border-border/50 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
            <div className="anime-corner pointer-events-none absolute inset-0" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-lg font-bold uppercase tracking-wider">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 transition-colors group-hover:bg-primary/25">
                  <Flag className="h-4 w-4 text-primary" />
                </div>
                Feature Flags
              </CardTitle>
              <CardDescription className="text-xs font-medium uppercase tracking-widest">
                Create, update, and manage your feature flags
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/flags">
                <Button className="font-semibold uppercase tracking-wider">
                  Manage Flags
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Card className="group relative overflow-hidden border-border/50 transition-all duration-300 hover:border-neon-cyan/40 hover:shadow-lg hover:shadow-neon-cyan/5">
            <div className="anime-corner pointer-events-none absolute inset-0" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-lg font-bold uppercase tracking-wider">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-cyan/15 transition-colors group-hover:bg-neon-cyan/25">
                  <Play className="h-4 w-4 text-neon-cyan" />
                </div>
                Demo Application
              </CardTitle>
              <CardDescription className="text-xs font-medium uppercase tracking-widest">
                See feature flags in action with different users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/demo">
                <Button variant="secondary" className="font-semibold uppercase tracking-wider">
                  Open Demo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
