"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { PlatformWorkspace } from "@/lib/platform/workspaces";

export function WorkspacePreviewPage({
  workspace,
}: {
  workspace: PlatformWorkspace;
}) {
  return (
    <div className="sc-workspace-preview">
      <Link href="/" className="sc-workspace-preview-back">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to SentraCore
      </Link>

      <p className="sc-ph-eyebrow">SentraCore Platform</p>
      <p className="sc-workspace-preview-status">{workspace.statusLabel}</p>
      <h1 className="sc-workspace-preview-title">{workspace.title}</h1>
      <p className="sc-workspace-preview-lede">
        {workspace.statusDetail ??
          "We’re building the next operating environment."}
      </p>

      {workspace.capabilities?.length ? (
        <ul className="sc-workspace-preview-capabilities">
          {workspace.capabilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <p className="sc-workspace-preview-note">{workspace.description}</p>

      <div className="sc-workspace-preview-actions">
        <Link href="/operations" className="sc-ph-enter">
          Enter Operations
        </Link>
        <Link href="/" className="sc-workspace-preview-secondary">
          Return to Platform Home
        </Link>
      </div>
    </div>
  );
}
