"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { useDashboard } from "../hooks/useDashboard";
import type { DashboardCard, DashboardSection } from "../types";
import {
  DashboardContextBanner,
  DashboardHealthCard,
  DashboardKpiCard,
  DashboardListCard,
  DashboardQuickActionCard,
} from "./DashboardCardView";

function renderCard(card: DashboardCard, index: number) {
  switch (card.kind) {
    case "kpi_stat":
      return <DashboardKpiCard key={card.id} card={card} index={index} />;
    case "entity_list":
    case "attention_queue":
      return <DashboardListCard key={card.id} card={card} />;
    case "health_summary":
      return <DashboardHealthCard key={card.id} card={card} />;
    case "quick_action":
      return <DashboardQuickActionCard key={card.id} card={card} />;
    default:
      return null;
  }
}

function SectionBlock({ section }: { section: DashboardSection }) {
  if (section.id === "context") {
    return null;
  }

  if (section.id === "health_strip" || section.id === "estate_baseline") {
    return (
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {section.title}
          </h3>
          {section.description ? (
            <p className="text-xs text-muted">{section.description}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {section.cards.map((card, index) => renderCard(card, index))}
        </div>
      </section>
    );
  }

  if (section.id === "quick_actions") {
    return (
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {section.title}
          </h3>
          {section.description ? (
            <p className="text-xs text-muted">{section.description}</p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {section.cards.map((card, index) => renderCard(card, index))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {section.title}
        </h3>
        {section.description ? (
          <p className="text-xs text-muted">{section.description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {section.cards.map((card, index) => renderCard(card, index))}
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { snapshot, loading, error, reload } = useDashboard();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-44 animate-pulse rounded-sc bg-slate-200/70" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-sc bg-slate-200/70"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <EmptyState
        title="Couldn’t load dashboard"
        description={error ?? "No snapshot available."}
        actionLabel="Retry"
        onAction={reload}
      />
    );
  }

  const healthCard = snapshot.sections
    .flatMap((section) => section.cards)
    .find((card) => card.kind === "health_summary");

  return (
    <div className="space-y-6">
      <DashboardContextBanner
        title={snapshot.context.title}
        subtitle={snapshot.context.subtitle ?? snapshot.health?.summary}
        currentUserId={snapshot.context.currentUserId}
        asOf={snapshot.asOf}
      />

      {healthCard ? (
        <div className="max-w-xl">
          <DashboardHealthCard card={healthCard} />
        </div>
      ) : null}

      {snapshot.sections
        .filter((section) => section.id !== "context")
        .map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}
    </div>
  );
}
