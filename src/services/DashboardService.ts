import type {
  ActivityItem,
  ApprovalItem,
  DashboardStat,
  Incident,
  MaintenanceTask,
  WorkOrder,
} from "@/types";
import { delay } from "./api";

const STATS: DashboardStat[] = [
  {
    id: "stat_sites",
    label: "Active Facilities",
    value: 24,
    change: "+2 this month",
    trend: "up",
    variant: "info",
  },
  {
    id: "stat_wo",
    label: "Open Work Orders",
    value: 47,
    change: "12 due today",
    trend: "neutral",
    variant: "warning",
  },
  {
    id: "stat_incidents",
    label: "Critical Incidents",
    value: 3,
    change: "-1 vs last week",
    trend: "down",
    variant: "danger",
  },
  {
    id: "stat_assets",
    label: "Assets Online",
    value: "98.2%",
    change: "+0.4% uptime",
    trend: "up",
    variant: "success",
  },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: "act_1",
    type: "work_order",
    title: "HVAC filter replacement completed",
    description: "WO-4821 closed at Lagos HQ Tower B",
    timestamp: "2026-08-03T11:40:00Z",
    actor: "Daniel Mensah",
  },
  {
    id: "act_2",
    type: "incident",
    title: "Water leak reported",
    description: "Critical severity opened in Plant Room 3",
    timestamp: "2026-08-03T10:55:00Z",
    actor: "Priya Sharma",
  },
  {
    id: "act_3",
    type: "approval",
    title: "CapEx request awaiting review",
    description: "Generator overhaul proposal — £48,200",
    timestamp: "2026-08-03T09:20:00Z",
    actor: "James Whitfield",
  },
  {
    id: "act_4",
    type: "maintenance",
    title: "Quarterly fire inspection scheduled",
    description: "Docklands Campus — 6 Aug 09:00",
    timestamp: "2026-08-03T08:05:00Z",
    actor: "Sophie Laurent",
  },
  {
    id: "act_5",
    type: "user",
    title: "New technician onboarded",
    description: "Fatima Al-Hassan added to Maintenance",
    timestamp: "2026-08-02T16:30:00Z",
    actor: "Amara Okonkwo",
  },
];

const APPROVALS: ApprovalItem[] = [
  {
    id: "apr_1",
    title: "Spare parts purchase — Chiller #04",
    type: "Procurement",
    requestedBy: "Priya Sharma",
    requestedAt: "2026-08-03T08:30:00Z",
    status: "pending",
  },
  {
    id: "apr_2",
    title: "Contractor access — Night shift",
    type: "Security",
    requestedBy: "James Whitfield",
    requestedAt: "2026-08-02T19:10:00Z",
    status: "pending",
  },
  {
    id: "apr_3",
    title: "Budget reallocation — Q3 utilities",
    type: "Finance",
    requestedBy: "Elena Rossi",
    requestedAt: "2026-08-02T14:45:00Z",
    status: "pending",
  },
];

const WORK_ORDERS: WorkOrder[] = [
  {
    id: "WO-4912",
    title: "Replace failed UPS battery pack",
    type: "corrective",
    maintenanceType: "unplanned",
    source: "manual",
    facilityId: "FAC-0001",
    assignedToUserId: "USR-0001",
    dueAt: "2026-08-03",
    status: "open",
    priority: "critical",
    createdAt: "2026-08-03T07:10:00Z",
    updatedAt: "2026-08-03T07:10:00Z",
  },
  {
    id: "WO-4908",
    title: "Investigate elevator door sensor",
    type: "corrective",
    maintenanceType: "unplanned",
    source: "manual",
    facilityId: "FAC-0002",
    assignedToUserId: "USR-0002",
    dueAt: "2026-08-04",
    status: "in_progress",
    priority: "high",
    createdAt: "2026-08-02T15:20:00Z",
    updatedAt: "2026-08-02T15:20:00Z",
  },
  {
    id: "WO-4901",
    title: "Calibrate BMS temperature sensors",
    type: "preventive",
    maintenanceType: "planned",
    source: "preventive_schedule",
    facilityId: "FAC-0003",
    assignedToUserId: "USR-0003",
    dueAt: "2026-08-05",
    status: "open",
    priority: "medium",
    createdAt: "2026-08-01T11:00:00Z",
    updatedAt: "2026-08-01T11:00:00Z",
  },
  {
    id: "WO-4895",
    title: "Repair loading bay shutter",
    type: "corrective",
    maintenanceType: "unplanned",
    source: "request",
    facilityId: "FAC-0004",
    assignedToUserId: "USR-0004",
    dueAt: "2026-08-06",
    status: "on_hold",
    priority: "high",
    createdAt: "2026-07-31T09:40:00Z",
    updatedAt: "2026-07-31T09:40:00Z",
  },
];

const INCIDENTS: Incident[] = [
  {
    id: "INC-220",
    title: "Plant Room 3 water ingress",
    severity: "critical",
    status: "investigating",
    facility: "Lagos HQ",
    reportedBy: "Priya Sharma",
    reportedAt: "2026-08-03T10:55:00Z",
  },
  {
    id: "INC-218",
    title: "Fire panel fault — Zone B",
    severity: "critical",
    status: "open",
    facility: "Docklands Campus",
    reportedBy: "Marcus Chen",
    reportedAt: "2026-08-03T06:15:00Z",
  },
  {
    id: "INC-214",
    title: "Generator fail-to-start during test",
    severity: "high",
    status: "investigating",
    facility: "Accra Hub",
    reportedBy: "Daniel Mensah",
    reportedAt: "2026-08-02T17:40:00Z",
  },
];

const MAINTENANCE: MaintenanceTask[] = [
  {
    id: "mnt_1",
    title: "Chiller #02 preventive service",
    asset: "CHL-002",
    facility: "Lagos HQ",
    scheduledDate: "2026-08-04",
    type: "preventive",
    status: "scheduled",
  },
  {
    id: "mnt_2",
    title: "Fire extinguisher inspection",
    asset: "FS-ALL",
    facility: "Docklands Campus",
    scheduledDate: "2026-08-06",
    type: "inspection",
    status: "scheduled",
  },
  {
    id: "mnt_3",
    title: "Lift hydraulic oil change",
    asset: "LFT-01A",
    facility: "Accra Hub",
    scheduledDate: "2026-08-03",
    type: "corrective",
    status: "overdue",
  },
  {
    id: "mnt_4",
    title: "AHU belt tension check",
    asset: "AHU-014",
    facility: "Plant West",
    scheduledDate: "2026-08-07",
    type: "preventive",
    status: "scheduled",
  },
];

export const DashboardService = {
  async getStats(): Promise<DashboardStat[]> {
    await delay();
    return STATS;
  },

  async getRecentActivity(): Promise<ActivityItem[]> {
    await delay();
    return ACTIVITY;
  },

  async getPendingApprovals(): Promise<ApprovalItem[]> {
    await delay();
    return APPROVALS;
  },

  async getOpenWorkOrders(): Promise<WorkOrder[]> {
    await delay();
    return WORK_ORDERS;
  },

  async getCriticalIncidents(): Promise<Incident[]> {
    await delay();
    return INCIDENTS;
  },

  async getUpcomingMaintenance(): Promise<MaintenanceTask[]> {
    await delay();
    return MAINTENANCE;
  },
};
