export const COUNTERPARTY_PARTY_KINDS = ["organisation", "person"] as const;
export const COUNTERPARTY_ROLES = ["customer", "vendor", "related_party"] as const;
export const COUNTERPARTY_STATUSES = ["active", "inactive"] as const;

export type CounterpartyPartyKind = (typeof COUNTERPARTY_PARTY_KINDS)[number];
export type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];
export type CounterpartyStatus = (typeof COUNTERPARTY_STATUSES)[number];

export type OrganisationCounterparty = {
  id: string;
  organisationId: string;
  displayName: string;
  legalName: string | null;
  partyKind: CounterpartyPartyKind;
  taxRegistrationId: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  country: string | null;
  status: CounterpartyStatus;
  roles: CounterpartyRole[];
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
};

export function isCounterpartyRole(value: unknown): value is CounterpartyRole {
  return typeof value === "string" && (COUNTERPARTY_ROLES as readonly string[]).includes(value);
}
