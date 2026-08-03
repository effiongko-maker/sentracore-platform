import type { MaintenanceTask } from "@/types";
import { delay } from "./api";

const MOCK_TASKS: MaintenanceTask[] = [
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
];

export const MaintenanceService = {
  async list(): Promise<MaintenanceTask[]> {
    await delay();
    return MOCK_TASKS;
  },

  async getUpcoming(): Promise<MaintenanceTask[]> {
    await delay();
    return MOCK_TASKS.filter((task) => task.status !== "completed");
  },
};
