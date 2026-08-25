"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  PLATFORM_WORKSPACES,
  getActiveWorkspace,
  type PlatformWorkspace,
} from "@/lib/platform/workspaces";
import { WorkspaceService } from "@/services/workspace/WorkspaceService";

type Pulse = {
  openIncidents: number;
  openMaintenance: number;
  openWorkOrders: number;
};

function FutureEnvironment({ workspace }: { workspace: PlatformWorkspace }) {
  return (
    <article className="sc-ph-future">
      <div className="sc-ph-future-header">
        <p className="sc-ph-status">{workspace.statusLabel}</p>
        <h3 className="sc-ph-future-title">{workspace.title}</h3>
      </div>
      <p className="sc-ph-future-desc">{workspace.description}</p>
      {workspace.capabilities?.length ? (
        <ul className="sc-ph-tags">
          {workspace.capabilities.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
      {workspace.statusDetail ? (
        <p className="sc-ph-future-meta">
          <span className="sc-ph-future-meta-status">
            {workspace.statusLabel}
          </span>
          <span aria-hidden className="sc-ph-future-meta-sep">
            —
          </span>
          <span>{workspace.statusDetail}</span>
        </p>
      ) : null}
    </article>
  );
}

export function PlatformHomePage() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [pulseReady, setPulseReady] = useState(false);
  const active = getActiveWorkspace();
  const others = PLATFORM_WORKSPACES.filter((w) => w.status !== "active");

  useEffect(() => {
    let cancelled = false;
    WorkspaceService.getWorkspace()
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot.operationalState.tone === "degraded") {
          setPulse(null);
        } else if (snapshot?.pulse) {
          setPulse({
            openIncidents: snapshot.pulse.openIncidents,
            openMaintenance: snapshot.pulse.openMaintenance,
            openWorkOrders: snapshot.pulse.openWorkOrders,
          });
        }
        setPulseReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setPulse(null);
          setPulseReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sc-ph">
      <header className="sc-ph-intro">
        <p className="sc-ph-eyebrow">SentraCore Platform</p>
        <h1 className="sc-ph-title">Choose your operating environment</h1>
        <p className="sc-ph-lede">
          Access the specialised environments that support how your organisation
          operates.
        </p>
      </header>

      <section
        className="sc-ph-primary"
        aria-labelledby="active-environment-heading"
      >
        <div className="sc-ph-primary-main">
          <p className="sc-ph-status sc-ph-status-active">Active</p>
          <h2
            id="active-environment-heading"
            className="sc-ph-primary-title"
          >
            {active.title}
          </h2>
          <p className="sc-ph-primary-desc">{active.description}</p>

          {pulseReady && pulse ? (
            <div className="sc-ph-metrics" aria-label="Operational summary">
              <div className="sc-ph-metric">
                <p className="sc-ph-metric-value">{pulse.openIncidents}</p>
                <p className="sc-ph-metric-label">Open incidents</p>
              </div>
              <div className="sc-ph-metric">
                <p className="sc-ph-metric-value">{pulse.openMaintenance}</p>
                <p className="sc-ph-metric-label">Maintenance</p>
              </div>
              <div className="sc-ph-metric">
                <p className="sc-ph-metric-value">{pulse.openWorkOrders}</p>
                <p className="sc-ph-metric-label">Work orders</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="sc-ph-primary-action">
          <Link href={active.href ?? "/operations"} className="sc-ph-enter">
            Enter Operations
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <section
        className="sc-ph-others"
        aria-labelledby="other-environments-heading"
      >
        <div className="sc-ph-others-header">
          <h2
            id="other-environments-heading"
            className="sc-ph-section-label"
          >
            Other operating environments
          </h2>
          <p className="sc-ph-section-lede">
            Additional SentraCore environments are being developed to support
            specialised areas of the organisation.
          </p>
        </div>

        <div className="sc-ph-others-grid">
          {others.map((workspace) => (
            <FutureEnvironment key={workspace.id} workspace={workspace} />
          ))}
        </div>
      </section>
    </div>
  );
}
