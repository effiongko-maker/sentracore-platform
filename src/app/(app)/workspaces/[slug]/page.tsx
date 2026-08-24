import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspacePreviewPage } from "@/modules/platform";
import {
  getWorkspace,
  type WorkspaceId,
} from "@/lib/platform/workspaces";

const SLUGS: WorkspaceId[] = [
  "ecc-operations",
  "finance",
  "construction",
  "projects-events",
];

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const workspace = getWorkspace(slug as WorkspaceId);
  return {
    title: workspace?.title ?? "Workspace",
  };
}

export default async function WorkspacePreviewRoute({ params }: Props) {
  const { slug } = await params;
  if (!SLUGS.includes(slug as WorkspaceId)) {
    notFound();
  }
  const workspace = getWorkspace(slug as WorkspaceId);
  if (!workspace || workspace.status === "active") {
    notFound();
  }
  return <WorkspacePreviewPage workspace={workspace} />;
}
