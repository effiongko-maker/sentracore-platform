import type { EccReportTypeId, EccReportWizardState } from "./types";

export type EccReportSessionStatus = "draft" | "ready" | "generated";

export type EccReportSessionRecord = {
  id: string;
  name: string;
  reportType: EccReportTypeId;
  status: EccReportSessionStatus;
  updatedAt: string;
  wizard: EccReportWizardState;
  hasGeneratedPreview?: boolean;
};

const STORAGE_KEY = "sentracore.ecc-report-sessions.v1";
const MAX_SESSIONS = 12;

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function loadEccReportSessions(): EccReportSessionRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EccReportSessionRecord[];
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
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  } catch {
    return [];
  }
}

export function saveEccReportSessions(
  sessions: EccReportSessionRecord[]
): void {
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

export function upsertEccReportSession(
  session: EccReportSessionRecord
): EccReportSessionRecord[] {
  const existing = loadEccReportSessions().filter(
    (item) => item.id !== session.id
  );
  const next = [session, ...existing].slice(0, MAX_SESSIONS);
  saveEccReportSessions(next);
  return next;
}

export function removeEccReportSession(id: string): EccReportSessionRecord[] {
  const next = loadEccReportSessions().filter((item) => item.id !== id);
  saveEccReportSessions(next);
  return next;
}

export function formatEccSessionRelativeTime(iso: string): string {
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

export function eccSessionStatusLabel(status: EccReportSessionStatus): string {
  switch (status) {
    case "ready":
      return "Ready to generate";
    case "generated":
      return "Generated";
    default:
      return "Draft";
  }
}

export function eccSessionActionLabel(status: EccReportSessionStatus): string {
  switch (status) {
    case "ready":
      return "Open";
    case "generated":
      return "View";
    default:
      return "Continue";
  }
}

export function buildEccSessionName(
  typeTitle: string,
  periodLabel: string
): string {
  const period = periodLabel.trim();
  return period ? `${typeTitle} · ${period}` : typeTitle;
}

export function deriveEccSessionStatus(
  wizard: EccReportWizardState,
  hasGeneratedPreview: boolean
): EccReportSessionStatus {
  if (hasGeneratedPreview) return "generated";
  if (
    wizard.reportType &&
    wizard.sections.length > 0 &&
    wizard.title.trim() &&
    wizard.rangeFrom &&
    wizard.rangeTo
  ) {
    return "ready";
  }
  return "draft";
}
