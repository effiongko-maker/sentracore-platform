"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  FileBarChart2,
  FileText,
  Layers3,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  Send,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/modals/Modal";
import { cn } from "@/lib/utils";
import { ECC_REPORT_TYPES, getEccReportType } from "./constants";
import {
  eccSessionActionLabel,
  eccSessionStatusLabel,
  formatEccSessionRelativeTime,
  type EccReportSessionRecord,
} from "./sessions";
import type { EccReportTypeDefinition, EccReportTypeId } from "./types";

const ASSISTANT_SUGGESTIONS = [
  "Prepare the monthly report for management",
  "Weekly operational brief for the centre",
  "Summarise open issues and escalations this month",
  "Show centre performance and operational response",
] as const;

const FREQUENT_TEMPLATE_IDS: EccReportTypeId[] = [
  "weekly",
  "monthly",
  "management",
];

const TEMPLATE_DISPLAY: Partial<
  Record<EccReportTypeId, { title: string; description: string; bestFor: string }>
> = {
  weekly: {
    title: "Weekly Operations",
    description:
      "A focused operational brief with key updates, activity, and immediate priorities.",
    bestFor: "Operations & Account Managers",
  },
  monthly: {
    title: "Monthly Operations",
    description:
      "A complete view of centre performance, activity, and priorities for the month.",
    bestFor: "Client & ECC Managers",
  },
  management: {
    title: "Executive Summary",
    description:
      "A concise management view of performance, risks, and what requires attention.",
    bestFor: "Executives & Stakeholders",
  },
};

const TEMPLATE_TONES: Record<
  EccReportTypeId,
  "green" | "orange" | "purple" | "teal" | "blue" | "amber"
> = {
  daily: "orange",
  weekly: "orange",
  monthly: "green",
  management: "teal",
  activity: "blue",
  incident: "amber",
  custom: "blue",
};

const TEMPLATE_ICONS: Record<EccReportTypeId, typeof FileText> = {
  daily: CalendarRange,
  weekly: CalendarRange,
  monthly: FileText,
  management: FileBarChart2,
  activity: Layers3,
  incident: AlertTriangle,
  custom: Settings2,
};

function SectionHead({
  title,
  support,
  action,
}: {
  title: string;
  support: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rp-section-head">
      <div>
        <h2 className="rp-section-title">{title}</h2>
        <p className="rp-section-support">{support}</p>
      </div>
      {action ? (
        <button type="button" className="rp-section-link" onClick={action.onClick}>
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function SessionCard({
  session,
  menuOpen,
  onToggleMenu,
  onOpen,
  onRequestDelete,
}: {
  session: EccReportSessionRecord;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: (session: EccReportSessionRecord) => void;
  onRequestDelete: (session: EccReportSessionRecord) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const Icon = TEMPLATE_ICONS[session.reportType] ?? FileText;
  const tone = TEMPLATE_TONES[session.reportType] ?? "blue";
  const isGenerated = session.status === "generated";
  const timeLabel = isGenerated
    ? formatEccSessionRelativeTime(session.updatedAt).replace(
        "Last edited",
        "Generated"
      )
    : formatEccSessionRelativeTime(session.updatedAt);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        onToggleMenu();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggleMenu();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, onToggleMenu]);

  return (
    <article className={cn("rp-session-card", `rp-tone-${tone}`)}>
      <div className="rp-session-card-top">
        <span className="rp-session-icon" aria-hidden>
          <Icon className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <div className="rp-session-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="rp-session-menu"
            aria-label="Report options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="rp-session-menu-popover" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleMenu();
                  onOpen(session);
                }}
              >
                {isGenerated ? "View report" : "Continue"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="rp-session-menu-danger"
                onClick={() => {
                  onToggleMenu();
                  onRequestDelete(session);
                }}
              >
                {isGenerated ? "Delete report" : "Delete draft"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <h3 className="rp-session-title">{session.name}</h3>
      <p
        className={cn(
          "rp-session-status",
          `rp-session-status-${session.status}`
        )}
      >
        {eccSessionStatusLabel(session.status)}
      </p>
      <p className="rp-session-time">{timeLabel}</p>
      <button
        type="button"
        className="rp-session-action"
        onClick={() => onOpen(session)}
      >
        {eccSessionActionLabel(session.status)}
      </button>
    </article>
  );
}

function LandingTemplateCard({
  item,
  onSelect,
}: {
  item: EccReportTypeDefinition;
  onSelect: (id: EccReportTypeId) => void;
}) {
  const display = TEMPLATE_DISPLAY[item.id];
  const title = display?.title ?? item.title;
  const description = display?.description ?? item.description;
  const bestFor =
    display?.bestFor ??
    (item.audience.length <= 1
      ? item.audience[0] ?? ""
      : item.audience.join(" & "));
  const Icon = TEMPLATE_ICONS[item.id] ?? FileText;
  const tone = TEMPLATE_TONES[item.id] ?? "blue";
  const includes = item.includes.slice(0, 4);

  return (
    <button
      type="button"
      className={cn("rp-template-card", `rp-tone-${tone}`)}
      onClick={() => onSelect(item.id)}
    >
      <span className="rp-template-icon" aria-hidden>
        <Icon className="h-4 w-4" strokeWidth={1.6} />
      </span>
      <h3 className="rp-template-title">{title}</h3>
      <p className="rp-template-desc">{description}</p>
      <div className="rp-template-includes">
        <p className="rp-template-includes-label">Includes</p>
        <ul>
          {includes.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
      <p className="rp-template-best">
        <span>Best for:</span> {bestFor}
      </p>
    </button>
  );
}

export type EccReportsLandingRegisters = {
  openIssues: number;
  openRequests: number;
  escalations: number;
  highUrgent: number;
  waitingOnOthers: number;
};

export function EccReportsLanding({
  sessions,
  showAllSessions,
  onToggleAllSessions,
  onCreateFromType,
  onCreateFromPrompt,
  onOpenSession,
  onDeleteSession,
  registers,
}: {
  sessions: EccReportSessionRecord[];
  showAllSessions: boolean;
  onToggleAllSessions: () => void;
  onCreateFromType: (id: EccReportTypeId) => void;
  onCreateFromPrompt: (prompt: string) => void;
  onOpenSession: (session: EccReportSessionRecord) => void;
  onDeleteSession: (id: string) => void;
  registers: EccReportsLandingRegisters;
}) {
  const [prompt, setPrompt] = useState("");
  const [landingView, setLandingView] = useState<"home" | "templates">("home");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<EccReportSessionRecord | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const visibleSessions = useMemo(
    () => sessions.slice(0, showAllSessions ? 8 : 4),
    [sessions, showAllSessions]
  );

  const frequentTemplates = useMemo(
    () =>
      FREQUENT_TEMPLATE_IDS.map((id) => getEccReportType(id)).filter(
        (item): item is EccReportTypeDefinition => Boolean(item)
      ),
    []
  );

  const submitPrompt = () => {
    const value = prompt.trim();
    if (!value) {
      promptRef.current?.focus();
      return;
    }
    onCreateFromPrompt(value);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDeleteSession(pendingDelete.id);
    setPendingDelete(null);
  };

  const deleteDialog = (
    <Modal
      open={Boolean(pendingDelete)}
      onClose={() => setPendingDelete(null)}
      title={
        pendingDelete?.status === "generated"
          ? "Delete report?"
          : "Delete draft?"
      }
      description={
        pendingDelete
          ? `“${pendingDelete.name}” will be permanently removed from Continue working.`
          : undefined
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            {pendingDelete?.status === "generated"
              ? "Delete report"
              : "Delete draft"}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-muted">
        This cannot be undone. After deletion it will not reappear when you
        refresh the page.
      </p>
    </Modal>
  );

  if (landingView === "templates") {
    return (
      <>
        <div className="rp-landing">
          <header className="rp-landing-header">
            <div>
              <button
                type="button"
                className="rp-wizard-back"
                onClick={() => setLandingView("home")}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to Reports
              </button>
              <p className="rp-landing-eyebrow" style={{ marginTop: "1.25rem" }}>
                Templates
              </p>
              <h1 className="rp-landing-title">All templates</h1>
              <p className="rp-landing-lede">
                Choose a starting point. You can refine scope and content in the
                next steps.
              </p>
            </div>
          </header>

          <section
            className="rp-landing-section"
            aria-label="All report templates"
          >
            <div className="rp-template-row rp-template-row-all">
              {ECC_REPORT_TYPES.map((item) => (
                <LandingTemplateCard
                  key={item.id}
                  item={item}
                  onSelect={onCreateFromType}
                />
              ))}
            </div>
          </section>
        </div>
        {deleteDialog}
      </>
    );
  }

  return (
    <>
      <div className="rp-landing">
        <header className="rp-landing-header">
          <div>
            <p className="rp-landing-eyebrow">Reporting</p>
            <h1 className="rp-landing-title">Reports</h1>
            <p className="rp-landing-lede">
              Turn operational activity into clear, useful reports.
            </p>
          </div>
          <button
            type="button"
            className="rp-create-btn"
            onClick={() => setLandingView("templates")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create report
          </button>
        </header>

        <section className="rp-assistant" aria-label="SentaCore report assistant">
          <div className="rp-assistant-copy">
            <span className="rp-assistant-mark" aria-hidden>
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <h2 className="rp-assistant-title">
              Get a head start with SentaCore
            </h2>
            <p className="rp-assistant-desc">
              Describe what you need and we&apos;ll help shape the right scope,
              content and structure.
            </p>
          </div>

          <div className="rp-assistant-compose">
            <label className="sr-only" htmlFor="ecc-rp-assistant-prompt">
              What would you like to report on?
            </label>
            <div className="rp-assistant-input-wrap">
              <textarea
                ref={promptRef}
                id="ecc-rp-assistant-prompt"
                className="rp-assistant-input"
                rows={2}
                placeholder="What would you like to report on?"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitPrompt();
                  }
                }}
              />
              <button
                type="button"
                className="rp-assistant-send"
                aria-label="Start report from prompt"
                onClick={submitPrompt}
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="rp-assistant-suggestions">
              <p className="rp-assistant-try">Try asking:</p>
              <div className="rp-assistant-pills">
                {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rp-assistant-pill"
                    onClick={() => onCreateFromPrompt(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rp-landing-section" aria-label="Continue working">
          <SectionHead
            title="Continue working"
            support="Pick up where you left off."
            action={
              sessions.length > 4
                ? {
                    label: showAllSessions ? "Show fewer" : "View all drafts",
                    onClick: onToggleAllSessions,
                  }
                : undefined
            }
          />

          {visibleSessions.length === 0 ? (
            <div className="rp-empty-panel rp-empty-panel-passive">
              <FileBarChart2 className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
              <div>
                <p className="rp-empty-title">No recent drafts yet</p>
                <p className="rp-empty-copy">
                  Reports you start will appear here so you can pick up where you
                  left off.
                </p>
              </div>
            </div>
          ) : (
            <div className="rp-session-row">
              {visibleSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  menuOpen={openMenuId === session.id}
                  onToggleMenu={() =>
                    setOpenMenuId((current) =>
                      current === session.id ? null : session.id
                    )
                  }
                  onOpen={onOpenSession}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </div>
          )}
        </section>

        <section
          className="rp-landing-section"
          aria-label="Frequently used reports"
        >
          <SectionHead
            title="Frequently used reports"
            support="Jump straight into the reports you use most."
          />
          <div className="rp-template-row">
            {frequentTemplates.map((item) => (
              <LandingTemplateCard
                key={item.id}
                item={item}
                onSelect={onCreateFromType}
              />
            ))}
          </div>
        </section>

        <section className="rp-landing-section" aria-label="Operational context">
          <div className="rp-ops-grid">
            <article className="rp-ops-card">
              <header className="rp-ops-card-head">
                <span className="rp-ops-card-icon" aria-hidden>
                  <LayoutGrid className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="rp-ops-card-title">Open registers</h2>
                  <p className="rp-ops-card-support">
                    Live counts from ECC operational registers.
                  </p>
                </div>
              </header>

              <div className="rp-ops-registers">
                <div className="rp-ops-registers-primary">
                  <div className="rp-ops-register rp-ops-register-primary">
                    <p className="rp-ops-register-value">
                      {registers.openIssues}
                    </p>
                    <p className="rp-ops-register-label">Open issues</p>
                    <Link
                      href="/ecc-operations/issues"
                      className="rp-ops-register-link"
                    >
                      View issues
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                  <div className="rp-ops-register rp-ops-register-primary">
                    <p className="rp-ops-register-value">
                      {registers.openRequests}
                    </p>
                    <p className="rp-ops-register-label">Open requests</p>
                    <Link
                      href="/ecc-operations/requests"
                      className="rp-ops-register-link"
                    >
                      View requests
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                </div>

                <div className="rp-ops-registers-secondary">
                  <div className="rp-ops-register">
                    <p className="rp-ops-register-value rp-ops-register-value-sm">
                      {registers.escalations}
                    </p>
                    <p className="rp-ops-register-label">Escalations</p>
                  </div>
                  <div className="rp-ops-register">
                    <p className="rp-ops-register-value rp-ops-register-value-sm">
                      {registers.highUrgent}
                    </p>
                    <p className="rp-ops-register-label">High / urgent</p>
                  </div>
                  <div className="rp-ops-register">
                    <p className="rp-ops-register-value rp-ops-register-value-sm">
                      {registers.waitingOnOthers}
                    </p>
                    <p className="rp-ops-register-label">Waiting on others</p>
                  </div>
                </div>
              </div>
            </article>

            <article className="rp-ops-card">
              <header className="rp-ops-card-head">
                <span className="rp-ops-card-icon" aria-hidden>
                  <Zap className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="rp-ops-card-title">Quick actions</h2>
                  <p className="rp-ops-card-support">
                    Common tasks for ECC operations.
                  </p>
                </div>
              </header>

              <div className="rp-ops-actions">
                <Link
                  href="/ecc-operations/daily-ops"
                  className="rp-ops-action-row is-primary"
                >
                  <span className="rp-ops-action-icon" aria-hidden>
                    <Plus className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <span className="rp-ops-action-copy">
                    <span className="rp-ops-action-title">Submit update</span>
                    <span className="rp-ops-action-desc">
                      Add a new operational update to the ECC register.
                    </span>
                  </span>
                  <ChevronRight className="rp-ops-action-cue" aria-hidden />
                </Link>
                <Link
                  href="/ecc-operations/daily-ops"
                  className="rp-ops-action-row"
                >
                  <span className="rp-ops-action-icon" aria-hidden>
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <span className="rp-ops-action-copy">
                    <span className="rp-ops-action-title">
                      View daily operations
                    </span>
                    <span className="rp-ops-action-desc">
                      Review recent Daily Ops submissions.
                    </span>
                  </span>
                  <ChevronRight className="rp-ops-action-cue" aria-hidden />
                </Link>
              </div>
            </article>
          </div>
        </section>
      </div>
      {deleteDialog}
    </>
  );
}
