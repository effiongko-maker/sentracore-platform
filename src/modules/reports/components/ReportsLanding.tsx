"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  FileBarChart2,
  FileText,
  Layers3,
  MoreHorizontal,
  Plus,
  Sparkles,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/modals/Modal";
import { cn } from "@/lib/utils";
import { getReportType, REPORT_TYPES } from "../constants";
import {
  actionLabel,
  formatSessionRelativeTime,
  statusLabel,
  type ReportSessionRecord,
} from "../sessions";
import type { ReportTypeDefinition, ReportTypeId } from "../types";

const ASSISTANT_SUGGESTIONS = [
  "Prepare the monthly report for management",
  "What happened at our highest-risk facilities this month?",
  "Show incidents trends and operational response",
  "Summarise maintenance and work orders this quarter",
] as const;

/** Curated shortcuts on the landing — full library lives under Create report. */
const FREQUENT_TEMPLATE_IDS: ReportTypeId[] = [
  "weekly_operations",
  "monthly_operations",
  "executive_summary",
];

const TEMPLATE_DISPLAY: Partial<
  Record<ReportTypeId, { title: string; description: string; bestFor: string }>
> = {
  monthly_operations: {
    title: "Monthly Operations",
    description:
      "A complete view of facility performance, activity, and priorities for the month.",
    bestFor: "Client & Facility Managers",
  },
  weekly_operations: {
    title: "Weekly Operations",
    description:
      "A focused operational brief with key updates, activity, and immediate priorities.",
    bestFor: "Operations & Account Managers",
  },
  quarterly_review: {
    title: "Quarterly Review",
    description:
      "A strategic review of performance, trends, and emerging areas of attention.",
    bestFor: "Client & Management",
  },
  executive_summary: {
    title: "Executive Summary",
    description:
      "A concise management view of performance, risks, and what requires attention.",
    bestFor: "Executives & Stakeholders",
  },
};

const TEMPLATE_TONES: Record<
  ReportTypeId,
  "green" | "orange" | "purple" | "teal" | "blue" | "amber"
> = {
  monthly_operations: "green",
  weekly_operations: "orange",
  quarterly_review: "purple",
  executive_summary: "teal",
  incident_report: "amber",
  maintenance_report: "blue",
};

const TEMPLATE_ICONS: Record<ReportTypeId, typeof FileText> = {
  monthly_operations: FileText,
  weekly_operations: CalendarRange,
  quarterly_review: Layers3,
  executive_summary: FileBarChart2,
  incident_report: FileBarChart2,
  maintenance_report: FileText,
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
  session: ReportSessionRecord;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: (session: ReportSessionRecord) => void;
  onRequestDelete: (session: ReportSessionRecord) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const Icon = TEMPLATE_ICONS[session.reportType] ?? FileText;
  const tone = TEMPLATE_TONES[session.reportType] ?? "blue";
  const isGenerated = session.status === "generated";
  const timeLabel = isGenerated
    ? formatSessionRelativeTime(session.updatedAt).replace(
        "Last edited",
        "Generated"
      )
    : formatSessionRelativeTime(session.updatedAt);

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
      <p className={cn("rp-session-status", `rp-session-status-${session.status}`)}>
        {statusLabel(session.status)}
      </p>
      <p className="rp-session-time">{timeLabel}</p>
      <button
        type="button"
        className="rp-session-action"
        onClick={() => onOpen(session)}
      >
        {actionLabel(session.status)}
      </button>
    </article>
  );
}

function LandingTemplateCard({
  item,
  onSelect,
}: {
  item: ReportTypeDefinition;
  onSelect: (id: ReportTypeId) => void;
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

export function ReportsLanding({
  sessions,
  showAllSessions,
  onToggleAllSessions,
  onCreateFromType,
  onCreateFromPrompt,
  onOpenSession,
  onDeleteSession,
}: {
  sessions: ReportSessionRecord[];
  showAllSessions: boolean;
  onToggleAllSessions: () => void;
  onCreateFromType: (id: ReportTypeId) => void;
  onCreateFromPrompt: (prompt: string) => void;
  onOpenSession: (session: ReportSessionRecord) => void;
  onDeleteSession: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [landingView, setLandingView] = useState<"home" | "templates">("home");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<ReportSessionRecord | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const visibleSessions = useMemo(
    () => sessions.slice(0, showAllSessions ? 8 : 4),
    [sessions, showAllSessions]
  );

  const frequentTemplates = useMemo(
    () =>
      FREQUENT_TEMPLATE_IDS.map((id) => getReportType(id)).filter(
        (item): item is ReportTypeDefinition => Boolean(item)
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
              {REPORT_TYPES.map((item) => (
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
            <h2 className="rp-assistant-title">Get a head start with SentaCore</h2>
            <p className="rp-assistant-desc">
              Describe what you need and we’ll help shape the right scope, content
              and structure.
            </p>
          </div>

          <div className="rp-assistant-compose">
            <label className="sr-only" htmlFor="rp-assistant-prompt">
              What would you like to report on?
            </label>
            <div className="rp-assistant-input-wrap">
              <textarea
                ref={promptRef}
                id="rp-assistant-prompt"
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
      </div>
      {deleteDialog}
    </>
  );
}
