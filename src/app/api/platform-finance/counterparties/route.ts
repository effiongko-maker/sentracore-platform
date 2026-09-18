/**
 * Platform Finance Counterparties API — org master data for billing.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { PLATFORM_FINANCE_CAPABILITIES, type PlatformFinanceCapability } from "@/modules/platform-finance/types";
import {
  requirePlatformFinanceAccess,
  requirePlatformFinanceAccessAny,
} from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceCounterpartiesServerService } from "@/modules/platform-finance/server/PlatformFinanceCounterpartiesServerService";
import {
  COUNTERPARTY_PARTY_KINDS,
  COUNTERPARTY_ROLES,
  COUNTERPARTY_STATUSES,
  type CounterpartyPartyKind,
  type CounterpartyRole,
  type CounterpartyStatus,
} from "@/modules/platform-finance/domain/counterparties";

type Action =
  | "getMyCounterpartyCapabilities"
  | "listCounterparties"
  | "getCounterparty"
  | "createCounterparty"
  | "updateCounterparty";

const READ_CAPS = [
  PLATFORM_FINANCE_CAPABILITIES.counterparty_view,
  PLATFORM_FINANCE_CAPABILITIES.counterparty_manage,
  PLATFORM_FINANCE_CAPABILITIES.invoice_view,
  PLATFORM_FINANCE_CAPABILITIES.invoice_create,
  PLATFORM_FINANCE_CAPABILITIES.invoice_review,
  PLATFORM_FINANCE_CAPABILITIES.invoice_issue,
] as const satisfies readonly PlatformFinanceCapability[];

type Body = {
  action?: Action;
  id?: string;
  input?: Record<string, unknown>;
};

function isPartyKind(v: unknown): v is CounterpartyPartyKind {
  return typeof v === "string" && (COUNTERPARTY_PARTY_KINDS as readonly string[]).includes(v);
}
function isStatus(v: unknown): v is CounterpartyStatus {
  return typeof v === "string" && (COUNTERPARTY_STATUSES as readonly string[]).includes(v);
}
function isRole(v: unknown): v is CounterpartyRole {
  return typeof v === "string" && (COUNTERPARTY_ROLES as readonly string[]).includes(v);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const action = body.action;
    if (!action) {
      return NextResponse.json({ success: false, message: "action required" }, { status: 400 });
    }

    if (action === "getMyCounterpartyCapabilities" || action === "listCounterparties" || action === "getCounterparty") {
      const access = await requirePlatformFinanceAccessAny({ capabilities: READ_CAPS });
      const svc = new PlatformFinanceCounterpartiesServerService(access.organisationId);
      const actor = { organisationId: access.organisationId, profileId: access.profileId };
      if (action === "getMyCounterpartyCapabilities") {
        return NextResponse.json({ success: true, data: await svc.getMyCapabilities(actor) });
      }
      if (action === "listCounterparties") {
        const status = isStatus(body.input?.status) ? body.input!.status : undefined;
        const role = isRole(body.input?.role) ? body.input!.role : undefined;
        return NextResponse.json({
          success: true,
          data: await svc.list(actor, { status, role }),
        });
      }
      if (!body.id) {
        return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
      }
      return NextResponse.json({ success: true, data: await svc.get(actor, body.id) });
    }

    if (action === "createCounterparty" || action === "updateCounterparty") {
      const access = await requirePlatformFinanceAccess({
        capability: PLATFORM_FINANCE_CAPABILITIES.counterparty_manage,
      });
      const svc = new PlatformFinanceCounterpartiesServerService(access.organisationId);
      const actor = { organisationId: access.organisationId, profileId: access.profileId };
      const input = body.input ?? {};
      if (action === "createCounterparty") {
        const rolesRaw = Array.isArray(input.roles) ? input.roles : [];
        const roles = rolesRaw.filter(isRole);
        return NextResponse.json({
          success: true,
          data: await svc.create(actor, {
            displayName: String(input.displayName ?? ""),
            legalName: (input.legalName as string | null | undefined) ?? null,
            partyKind: isPartyKind(input.partyKind) ? input.partyKind : "organisation",
            taxRegistrationId: (input.taxRegistrationId as string | null | undefined) ?? null,
            contactPerson:(input.contactPerson as string|null|undefined)??null,email:(input.email as string|null|undefined)??null,phone:(input.phone as string|null|undefined)??null,
            addressLine1:(input.addressLine1 as string|null|undefined)??null,addressLine2:(input.addressLine2 as string|null|undefined)??null,city:(input.city as string|null|undefined)??null,stateRegion:(input.stateRegion as string|null|undefined)??null,country:(input.country as string|null|undefined)??null,
            roles,
            status: isStatus(input.status) ? input.status : "active",
          }),
        });
      }
      if (!body.id) {
        return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
      }
      const roles =
        input.roles === undefined
          ? undefined
          : (Array.isArray(input.roles) ? input.roles : []).filter(isRole);
      return NextResponse.json({
        success: true,
        data: await svc.update(actor, body.id, {
          displayName: input.displayName !== undefined ? String(input.displayName) : undefined,
          legalName:
            input.legalName === undefined ? undefined : ((input.legalName as string | null) ?? null),
          partyKind: isPartyKind(input.partyKind) ? input.partyKind : undefined,
          taxRegistrationId:
            input.taxRegistrationId === undefined
              ? undefined
              : ((input.taxRegistrationId as string | null) ?? null),
          contactPerson:input.contactPerson===undefined?undefined:((input.contactPerson as string|null)??null),email:input.email===undefined?undefined:((input.email as string|null)??null),phone:input.phone===undefined?undefined:((input.phone as string|null)??null),addressLine1:input.addressLine1===undefined?undefined:((input.addressLine1 as string|null)??null),addressLine2:input.addressLine2===undefined?undefined:((input.addressLine2 as string|null)??null),city:input.city===undefined?undefined:((input.city as string|null)??null),stateRegion:input.stateRegion===undefined?undefined:((input.stateRegion as string|null)??null),country:input.country===undefined?undefined:((input.country as string|null)??null),
          status: isStatus(input.status) ? input.status : undefined,
          roles,
        }),
      });
    }

    return NextResponse.json({ success: false, message: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (isActionError(error)) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "FORBIDDEN" || error.code === "MODULE_NOT_ENABLED"
            ? 403
            : error.code === "VALIDATION_ERROR"
              ? 400
              : 500;
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status }
      );
    }
    console.error("[platform-finance/counterparties]", error);
    return NextResponse.json({ success: false, message: "Internal error" }, { status: 500 });
  }
}
