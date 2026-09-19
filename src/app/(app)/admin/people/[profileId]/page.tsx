import type { Metadata } from "next";
import { PersonView } from "@/modules/platform-admin/client/PersonView";

export const metadata: Metadata = { title: "Person" };

export default async function PersonRoute({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  return <PersonView profileId={decodeURIComponent(profileId)} />;
}
