import type { ReportTypeId, ReportWizardState } from "./types";

export type ReportSessionStatus = "draft" | "ready" | "generated";

export type ReportSessionRecord = {
  id: string;
  name: string;
  reportType: ReportTypeId;
  status: ReportSessionStatus;
  updatedAt: string;
  wizard: ReportWizardState;
  /** Present when a preview was generated in this browser session. */
  hasGeneratedPreview?: boolean;
};

const STORAGE_KEY = "sentracore.report-sessions.v1";
const MAX_SESSIONS = 12;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadReportSessions(): ReportSessionRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReportSessionRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.reportType === "string" &&
          typeof item.status === "string" &&
          typeof item.updatedAt === "string" &&
          item.wizard
      )
      .sort(
        (a, b) =>
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      );
  } catch {
    return [];
  }
}

export function saveReportSessions(sessions: ReportSessionRecord[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(sessions.slice(0, MAX_SESSIONS))
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function upsertReportSession(
  session: ReportSessionRecord
): ReportSessionRecord[] {
  const existing = loadReportSessions().filter((item) => item.id !== session.id);
  const next = [session, ...existing].slice(0, MAX_SESSIONS);
  saveReportSessions(next);
  return next;
}

export function removeReportSession(id: string): ReportSessionRecord[] {
  const next = loadReportSessions().filter((item) => item.id !== id);
  saveReportSessions(next);
  return next;
}

export function formatSessionRelativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "Just now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) {
    return `Last edited ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last edited ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `Last edited ${days} day${days === 1 ? "" : "s"} ago`;
  }
  return `Last edited ${new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })}`;
}

export function statusLabel(status: ReportSessionStatus): string {
  switch (status) {
    case "ready":
      return "Ready to generate";
    case "generated":
      return "Generated";
    default:
      return "Draft";
  }
}

export function actionLabel(status: ReportSessionStatus): string {
  switch (status) {
    case "ready":
      return "Open";
    case "generated":
      return "View";
    default:
      return "Continue";
  }
}

export function deriveSessionStatus(
  wizard: ReportWizardState,
  hasGeneratedPreview: boolean
): ReportSessionStatus {
  if (hasGeneratedPreview) return "generated";
  if (wizard.step === "generate" && wizard.reportType) return "ready";
  return "draft";
}

export function buildSessionName(
  reportTypeTitle: string,
  periodLabel: string
): string {
  const trimmedPeriod = periodLabel.trim();
  if (!trimmedPeriod) return reportTypeTitle;
  // Prefer period-led names like "August Monthly Operations" when monthly.
  if (/^[A-Za-z]+ \d{4}$/.test(trimmedPeriod)) {
    const month = trimmedPeriod.split(" ")[0];
    return `${month} ${reportTypeTitle}`;
  }
  return `${reportTypeTitle} · ${trimmedPeriod}`;
}
