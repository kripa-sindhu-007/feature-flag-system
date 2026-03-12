"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Flag, Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { pageTransition, defaultTransition } from "@/components/motion/variants";

export default function HomePage() {
  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your feature flags and test them in the demo app.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Feature Flags
            </CardTitle>
            <CardDescription>
              Create, update, and manage your feature flags.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/flags">
              <Button>
                Manage Flags
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Demo Application
            </CardTitle>
            <CardDescription>
              See feature flags in action with different users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/demo">
              <Button variant="secondary">
                Open Demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
