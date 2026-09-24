import "server-only";
import { cookies } from "next/headers";
import { ActionError } from "@/lib/actions/errors";
import { requirePrivateOfficeAccess } from "@/modules/private-office/server/requirePrivateOfficeAccess";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { DatabaseVaultStore, type Rpc } from "./DatabaseVaultStore";
import { PrivateVaultService, type VaultActor, type WebAuthnConfig } from "./PrivateVaultService";

/**
 * Private Office vault gate. The actor comes only from the authenticated session and the real Private Office
 * gate (Executive Office entry + explicit Private Office grant; Super Admin / platform.admin_override never
 * consulted). The database re-verifies session, owner and grants on every call.
 */

export function vaultWebAuthnConfig(): WebAuthnConfig {
  const configured = process.env.PRIVATE_OFFICE_ORIGIN || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);
  if (!configured) throw new Error("Private Office origin is not configured.");
  const url = new URL(configured);
  if (url.origin !== configured || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost"))) {
    throw new Error("Private Office requires a canonical HTTPS origin.");
  }
  return { origin: url.origin, rpID: url.hostname, rpName: "SentraCore Private Office" };
}

export async function resolveVaultActor(): Promise<VaultActor> {
  const access = await requirePrivateOfficeAccess();
  const { data, error } = await createClient(await cookies()).auth.getClaims();
  const sessionId = data?.claims?.session_id;
  if (error || typeof sessionId !== "string" || !sessionId || data?.claims.sub !== access.profileId) {
    throw new ActionError("UNAUTHENTICATED");
  }
  return { organisationId: access.organisationId, profileId: access.profileId, sessionId };
}

const serviceRoleRpc: Rpc = async (fn, params) => {
  const { data, error } = await createAdminClient().rpc(fn, params);
  return { data, error };
};

export function vaultService(actor: VaultActor): PrivateVaultService {
  return new PrivateVaultService(new DatabaseVaultStore(actor, serviceRoleRpc), vaultWebAuthnConfig());
}
