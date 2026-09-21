import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { BatcavePage } from "@/modules/batcave/components/BatcavePage";
import { requireBatcaveAccess } from "@/modules/batcave/server/requireBatcaveAccess";

export const metadata: Metadata = {
  title: "Batcave",
};

/**
 * Server-gated. Anyone without the explicit Batcave grant (or outside the platform boundary)
 * receives a plain not-found — the page never confirms that a private workspace exists.
 */
export default async function BatcaveRoute() {
  try {
    await requireBatcaveAccess();
  } catch (error) {
    if (isActionError(error) && error.code === "UNAUTHENTICATED") redirect("/login");
    notFound();
  }
  return <BatcavePage />;
}
