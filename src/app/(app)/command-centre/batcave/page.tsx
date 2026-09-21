import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { requireOrganisationTimeZone } from "@/lib/time/organisationTime";
import { BatcavePage } from "@/modules/batcave/components/BatcavePage";
import { BatcaveNotesService } from "@/modules/batcave/notes/server/BatcaveNotesService";
import type { BatcaveNote } from "@/modules/batcave/notes/domain";
import { requireBatcaveAccess } from "@/modules/batcave/server/requireBatcaveAccess";

export const metadata: Metadata = {
  title: "Batcave",
};

/**
 * Server-gated. Anyone without the explicit Batcave grant (or outside the platform boundary)
 * receives a plain not-found — the page never confirms that a private workspace exists.
 */
export default async function BatcaveRoute() {
  let access;
  try {
    access = await requireBatcaveAccess();
  } catch (error) {
    if (isActionError(error) && error.code === "UNAUTHENTICATED") redirect("/login");
    notFound();
  }

  let notes: BatcaveNote[] | null = null;
  try {
    notes = await new BatcaveNotesService(access).list();
  } catch {
    notes = null; // failure ≠ empty
  }
  let timeZone: string | null = null;
  try {
    timeZone = requireOrganisationTimeZone(access.session.organisation);
  } catch {
    timeZone = null;
  }
  return <BatcavePage notes={notes} timeZone={timeZone} />;
}
