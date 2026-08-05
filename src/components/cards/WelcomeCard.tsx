"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { CurrentUser } from "@/types";

interface WelcomeCardProps {
  user: CurrentUser | null;
}

/** @deprecated Prefer Home WelcomeHero / DashboardContextBanner. Kept for compatibility. */
export function WelcomeCard({ user }: WelcomeCardProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="relative overflow-hidden rounded-sc border border-border/80 bg-primary px-6 py-7 text-white shadow-sc-lg sm:px-8"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-20 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/70">
            Home
          </p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting}
            {user ? `, ${user.name.split(" ")[0]}` : ""}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
            Your personal starting point for today&apos;s facility work.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/work-orders">
            <Button className="bg-white text-primary hover:bg-slate-100">
              Review work orders
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/incidents">
            <Button
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              View incidents
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
