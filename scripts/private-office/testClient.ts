/**
 * Verification-only: runs the REAL client flows (security/client/vaultFlows.ts) against the REAL protocol service,
 * through an adapter that mirrors src/app/api/private-office/vault/route.ts (action dispatch, lease moved into an
 * HttpOnly-style cookie and stripped from the JSON body). Every request body and response body is recorded exactly
 * as it would cross the network.
 */
import type { PrivateVaultService, VaultActor } from "../../src/modules/private-office/security/server/PrivateVaultService";
import type { Api, Assertion, Authenticate, Enrolled } from "../../src/modules/private-office/security/client/vaultFlows";
import type { SoftAuthenticator } from "./softAuthenticator";

export type Wire = { requests: string[]; responses: string[] };

export function routeApi(service: PrivateVaultService, actor: VaultActor, jar: { lease: string | null }, wire: Wire): Api {
  return (async (action: string, fields: Record<string, unknown> = {}) => {
    wire.requests.push(JSON.stringify({ action, ...fields }));
    const body = fields as Record<string, never>;
    const lease = jar.lease;
    const withLease = (result: Record<string, unknown>) => {
      const { leaseToken, ...rest } = result;
      if (typeof leaseToken === "string") jar.lease = leaseToken;
      return rest;
    };
    let data: unknown;
    switch (action) {
      case "status": data = await service.status(actor, lease); break;
      case "lock": data = await service.lock(actor, lease); jar.lease = null; break;
      case "activation-begin": data = await service.beginActivation(actor); break;
      case "registration-begin": data = await service.beginRegistration(actor, body.purpose === "add" ? "add" : "create", lease, body.activation); break;
      case "registration-finish": data = await service.finishRegistration(actor, String(body.challengeId), body.response); break;
      case "authentication-begin": data = await service.beginAuthentication(actor, body.purpose, body.credentialId, lease); break;
      case "authentication-finish": data = withLease(await service.finishAuthentication(actor, String(body.challengeId), body.response, lease)); break;
      case "vault-create": data = withLease(await service.createVault(actor, body.input)); break;
      case "recovery-begin": data = await service.beginRecovery(actor); break;
      case "recovery-finish": data = withLease(await service.completeRecovery(actor, String(body.challengeId), String(body.signature))); break;
      case "identity-get": data = await service.identity(actor, lease); break;
      case "authority-begin": data = await service.beginAuthority(actor, lease, body.purpose); break;
      case "recovery-rotate": data = withLease(await service.rotateRecovery(actor, lease, body.input)); break;
      case "passkey-add": data = withLease(await service.addPasskey(actor, lease, body.input)); break;
      case "passkey-remove": data = withLease(await service.removePasskey(actor, lease, body.input)); break;
      case "items-list": data = await service.listItems(actor, lease); break;
      case "records-append": data = await service.appendRecords(actor, lease, body.input); break;
      default: throw new Error(`unknown action ${action}`);
    }
    wire.responses.push(JSON.stringify(data));
    return data;
  }) as Api;
}

export function softAuthenticate(auth: SoftAuthenticator): Authenticate {
  return async (options: never): Promise<Assertion> => {
    const a = await auth.assert(options as never);
    return { response: a.response, credentialId: auth.id, prfOutput: a.prfOutput ? new Uint8Array(a.prfOutput) : null };
  };
}

/** Client-side enrolment as the shell performs it (registration → PRF, confirming by assertion if needed). */
export async function enrolPasskey(api: Api, auth: SoftAuthenticator, purpose: "create" | "add", activation?: { challengeId: string; signature: string }): Promise<Enrolled & { vaultId: string }> {
  const begin = await api<{ challengeId: string; vaultId: string; prfSalt: string; options: never }>("registration-begin", { purpose, activation });
  const reg = await auth.register(begin.options as never);
  const registered = await api<{ credentialId: string; wrapperId: string; publicKey: string }>("registration-finish", { challengeId: begin.challengeId, response: reg.response });
  let prf = reg.prfOutput;
  if (!prf && reg.prfEnabled) {
    const confirm = await api<{ challengeId: string; options: never }>("authentication-begin", { purpose: "confirm-prf", credentialId: registered.credentialId });
    const a = await auth.assert(confirm.options as never);
    await api("authentication-finish", { challengeId: confirm.challengeId, response: a.response });
    prf = a.prfOutput;
  }
  if (!prf) throw new Error("PRF unavailable — fail closed");
  return { vaultId: begin.vaultId, credentialId: registered.credentialId, wrapperId: registered.wrapperId, publicKey: registered.publicKey, prfSalt: begin.prfSalt, prf: new Uint8Array(prf) };
}
