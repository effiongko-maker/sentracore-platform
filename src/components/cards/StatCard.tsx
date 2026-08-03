"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { DashboardStat } from "@/types";

const accentMap = {
  success: "bg-emerald-50 text-success",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-danger",
  info: "bg-accent-soft text-accent",
  default: "bg-slate-100 text-slate-600",
  neutral: "bg-slate-100 text-muted",
};

interface StatCardProps {
  stat: DashboardStat;
  index?: number;
}

export function StatCard({ stat, index = 0 }: StatCardProps) {
  const TrendIcon =
    stat.trend === "up"
      ? ArrowUpRight
      : stat.trend === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
    >
      <Card className="p-5 transition-shadow duration-200 hover:shadow-sc-lg">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted">{stat.label}</p>
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-xl",
              accentMap[stat.variant]
            )}
          >
            <TrendIcon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">
          {stat.value}
        </p>
        <p className="mt-2 text-xs text-muted">{stat.change}</p>
      </Card>
    </motion.div>
  );
}
