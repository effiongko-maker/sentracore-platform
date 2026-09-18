import type { OrganisationCounterparty, CounterpartyRole, CounterpartyStatus } from "@/modules/platform-finance/domain/counterparties";
import type { CounterpartyCapabilities } from "@/modules/platform-finance/server/PlatformFinanceCounterpartiesServerService";

const API_PATH = "/api/platform-finance/counterparties";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string };

async function postAction<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new Error(("message" in json && json.message) || `Counterparty action failed (${action}).`);
  }
  return json.data;
}

export const PlatformFinanceCounterpartiesService = {
  getMyCapabilities(): Promise<CounterpartyCapabilities> {
    return postAction("getMyCounterpartyCapabilities");
  },
  list(opts?: { status?: CounterpartyStatus; role?: CounterpartyRole }): Promise<OrganisationCounterparty[]> {
    return postAction("listCounterparties", { input: opts ?? {} });
  },
  get(id: string): Promise<OrganisationCounterparty> {
    return postAction("getCounterparty", { id });
  },
  create(input: {
    displayName: string;
    legalName?: string | null;
    partyKind?: "organisation" | "person";
    taxRegistrationId?: string | null;
    contactPerson?: string|null; email?: string|null; phone?: string|null; addressLine1?: string|null; addressLine2?: string|null; city?: string|null; stateRegion?: string|null; country?: string|null;
    roles: CounterpartyRole[];
    status?: CounterpartyStatus;
  }): Promise<OrganisationCounterparty> {
    return postAction("createCounterparty", { input });
  },
  update(
    id: string,
    input: {
      displayName?: string;
      legalName?: string | null;
      partyKind?: "organisation" | "person";
      taxRegistrationId?: string | null;
      contactPerson?: string|null; email?: string|null; phone?: string|null; addressLine1?: string|null; addressLine2?: string|null; city?: string|null; stateRegion?: string|null; country?: string|null;
      status?: CounterpartyStatus;
      roles?: CounterpartyRole[];
    }
  ): Promise<OrganisationCounterparty> {
    return postAction("updateCounterparty", { id, input });
  },
};
