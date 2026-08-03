"use client";

import { useEffect, useState } from "react";
import { WelcomeCard } from "@/components/cards/WelcomeCard";
import { StatCard } from "@/components/cards/StatCard";
import {
  CriticalIncidentsCard,
  OpenWorkOrdersCard,
  PendingApprovalsCard,
  QuickActionsCard,
  RecentActivityCard,
  UpcomingMaintenanceCard,
} from "@/components/cards/DashboardPanels";
import { DashboardService, UserService } from "@/services";
import type {
  ActivityItem,
  ApprovalItem,
  CurrentUser,
  DashboardStat,
  Incident,
  MaintenanceTask,
  WorkOrder,
} from "@/types";

export function HomeDashboard() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const [
        currentUser,
        dashboardStats,
        recentActivity,
        pendingApprovals,
        openWorkOrders,
        criticalIncidents,
        upcomingMaintenance,
      ] = await Promise.all([
        UserService.getCurrentUser(),
        DashboardService.getStats(),
        DashboardService.getRecentActivity(),
        DashboardService.getPendingApprovals(),
        DashboardService.getOpenWorkOrders(),
        DashboardService.getCriticalIncidents(),
        DashboardService.getUpcomingMaintenance(),
      ]);

      if (!mounted) return;

      setUser(currentUser);
      setStats(dashboardStats);
      setActivity(recentActivity);
      setApprovals(pendingApprovals);
      setWorkOrders(openWorkOrders);
      setIncidents(criticalIncidents);
      setMaintenance(upcomingMaintenance);
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-44 animate-pulse rounded-sc bg-slate-200/70" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-sc bg-slate-200/70"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WelcomeCard user={user} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard key={stat.id} stat={stat} index={index} />
        ))}
      </div>

      <QuickActionsCard />

      <div className="grid gap-4 xl:grid-cols-2">
        <RecentActivityCard items={activity} />
        <PendingApprovalsCard items={approvals} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <OpenWorkOrdersCard items={workOrders} />
        <CriticalIncidentsCard items={incidents} />
        <UpcomingMaintenanceCard items={maintenance} />
      </div>
    </div>
  );
}
