import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import { resolveFmIncidentOrganisation } from "@/modules/incidents/server/FmIncidentServerService";
import { loadAssignablePeople } from "@/modules/users/server/assignablePeople";

/**
 * Operational assignment catalog. Requires ops.view, not the users directory capability.
 * Returns { id, name, role, facilityId } only (see loadAssignablePeople).
 * /api/users and its gate are unchanged.
 */
export async function POST() {
  try {
    const gate = await gateApiCapability("ops.view");
    if (!gate.ok) return gate.response;
    const { organisationId } = resolveFmIncidentOrganisation(gate.session);
    const data = await loadAssignablePeople(organisationId);
    return NextResponse.json(
      { success: true, message: "", data },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/assignable-people] error:", error);
    return NextResponse.json(
      { success: false, message: "People for assignment are unavailable.", data: null },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
