import type { WorkOrder } from "@/types";
import { delay } from "./api";

const MOCK_WORK_ORDERS: WorkOrder[] = [
  {
    id: "WO-4912",
    title: "Replace failed UPS battery pack",
    priority: "critical",
    status: "open",
    assignee: "Daniel Mensah",
    facility: "Lagos HQ",
    dueDate: "2026-08-03",
    createdAt: "2026-08-03T07:10:00Z",
  },
  {
    id: "WO-4908",
    title: "Investigate elevator door sensor",
    priority: "high",
    status: "in_progress",
    assignee: "Liam O'Connor",
    facility: "Docklands Campus",
    dueDate: "2026-08-04",
    createdAt: "2026-08-02T15:20:00Z",
  },
  {
    id: "WO-4901",
    title: "Calibrate BMS temperature sensors",
    priority: "medium",
    status: "open",
    assignee: "Fatima Al-Hassan",
    facility: "Accra Hub",
    dueDate: "2026-08-05",
    createdAt: "2026-08-01T11:00:00Z",
  },
];

export const WorkOrderService = {
  async list(): Promise<WorkOrder[]> {
    await delay();
    return MOCK_WORK_ORDERS;
  },

  async getOpen(): Promise<WorkOrder[]> {
    await delay();
    return MOCK_WORK_ORDERS.filter(
      (order) => order.status === "open" || order.status === "in_progress"
    );
  },

  async getById(id: string): Promise<WorkOrder | null> {
    await delay();
    return MOCK_WORK_ORDERS.find((order) => order.id === id) ?? null;
  },
};
