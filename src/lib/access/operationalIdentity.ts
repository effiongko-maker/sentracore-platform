import type { User } from "@/modules/users/types";

/**
 * FM identity-link helper. Not used for FM runtime authorization after Phase 2A.
 * Transitional consumers may still map profile → historical Sheet assignee IDs
 * for Work lookup until that domain cuts over.
 */

export type FmIdentityLink = {
  externalIdentityId: string;
  status: "active" | "inactive";
};

export type FmIdentityResolution = {
  source: "explicit_link" | "email_fallback" | "none";
  operationalUserId: string | null;
  enrichment: "resolved" | "unavailable" | "not_found" | "not_applicable";
  user: Pick<
    User,
    "id" | "role" | "status" | "facility" | "name" | "email"
  > | null;
};

export async function resolveFmOperationalIdentity(options: {
  explicitLink: FmIdentityLink | null;
  email: string;
  loadById: (id: string) => Promise<FmIdentityResolution["user"]>;
  loadByEmail: (email: string) => Promise<FmIdentityResolution["user"]>;
}): Promise<FmIdentityResolution> {
  if (options.explicitLink) {
    if (options.explicitLink.status !== "active") {
      return {
        source: "explicit_link",
        operationalUserId: null,
        enrichment: "not_applicable",
        user: null,
      };
    }
    const operationalUserId = options.explicitLink.externalIdentityId;
    try {
      const user = await options.loadById(operationalUserId);
      return {
        source: "explicit_link",
        operationalUserId,
        enrichment: user ? "resolved" : "not_found",
        user,
      };
    } catch {
      // The durable identity remains known even when People enrichment is down.
      // Authority is derived from `user`, so callers still fail closed.
      return {
        source: "explicit_link",
        operationalUserId,
        enrichment: "unavailable",
        user: null,
      };
    }
  }
  const user = await options.loadByEmail(options.email);
  return {
    source: user ? "email_fallback" : "none",
    operationalUserId: user?.id ?? null,
    enrichment: user ? "resolved" : "not_applicable",
    user,
  };
}
