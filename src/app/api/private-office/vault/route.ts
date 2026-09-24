import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { LEASE_ABSOLUTE_MS, LEASE_COOKIE } from "@/modules/private-office/security/shared/protocol";
import { VaultError } from "@/modules/private-office/security/server/PrivateVaultService";
import { ConcurrentChangeError } from "@/modules/private-office/security/server/DatabaseVaultStore";
import {
  vaultService,
  vaultWebAuthnConfig,
  resolveVaultActor,
} from "@/modules/private-office/security/server/vaultGate";

/** Session-bound, same-origin ciphertext/security protocol. Never receives financial plaintext. */
export const runtime = "nodejs";
const COOKIE_PATH = "/api/private-office/vault";
const notFound = () => NextResponse.json({ success: false }, { status: 404 });

function sameOrigin(request: Request): boolean {
  const expected = vaultWebAuthnConfig().origin;
  const site = request.headers.get("sec-fetch-site");
  return (
    request.headers.get("origin") === expected &&
    (site === null || site === "same-origin") &&
    (request.headers.get("content-type") ?? "").startsWith("application/json")
  );
}

type Body = Record<string, unknown> & { action?: string };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ success: false }, { status: 403 });

  let body: Body;
  try {
    const text = await request.text();
    if (text.length > 131072) return NextResponse.json({ success: false }, { status: 413 });
    body = JSON.parse(text) as Body;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  try {
    const actor = await resolveVaultActor();
    const service = vaultService(actor);
    const jar = await cookies();
    const lease = jar.get(LEASE_COOKIE)?.value ?? null;
    const setLease = (token: string) => {
      const origin = new URL(vaultWebAuthnConfig().origin);
      jar.set(LEASE_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        // Browsers treat http://localhost as a secure context; everywhere else HTTPS is required.
        secure: origin.protocol === "https:" || origin.hostname === "localhost",
        path: COOKIE_PATH,
        maxAge: Math.floor(LEASE_ABSOLUTE_MS / 1000),
      });
    };
    const withLease = <T extends { leaseToken?: string }>(result: T) => {
      const { leaseToken, ...rest } = result;
      if (leaseToken) setLease(leaseToken);
      return rest;
    };

    let data: unknown;
    switch (body.action) {
      case "status":
        data = await service.status(actor, lease);
        break;
      case "touch":
        data = await service.touch(actor, lease, body.userActive === true);
        break;
      case "lock":
        data = await service.lock(actor, lease);
        jar.delete({ name: LEASE_COOKIE, path: COOKIE_PATH });
        break;
      case "activation-begin":
        data = await service.beginActivation(actor);
        break;
      case "registration-begin":
        data = await service.beginRegistration(actor, body.purpose === "add" ? "add" : "create", lease, body.activation as never);
        break;
      case "registration-finish":
        data = await service.finishRegistration(actor, String(body.challengeId), body.response as never);
        break;
      case "authentication-begin":
        data = await service.beginAuthentication(actor, body.purpose === "rotate-recovery" ? "rotate-recovery" : body.purpose === "confirm-prf" ? "confirm-prf" : "unlock", body.credentialId ? String(body.credentialId) : undefined, lease);
        break;
      case "authentication-finish":
        data = withLease(await service.finishAuthentication(actor, String(body.challengeId), body.response as never, lease));
        break;
      case "vault-create":
        data = withLease(await service.createVault(actor, body.input as never));
        break;
      case "recovery-begin":
        data = await service.beginRecovery(actor);
        break;
      case "recovery-finish":
        data = withLease(await service.completeRecovery(actor, String(body.challengeId), String(body.signature)));
        break;
      case "authority-begin":
        data = await service.beginAuthority(actor, lease, body.purpose === "append-records" ? "append-records" : body.purpose === "remove-passkey" ? "remove-passkey" : "add-passkey");
        break;
      case "recovery-rotate":
        data = withLease(await service.rotateRecovery(actor, lease, body.input as never));
        break;
      case "passkey-add":
        data = withLease(await service.addPasskey(actor, lease, body.input as never));
        break;
      case "passkey-remove":
        data = withLease(await service.removePasskey(actor, lease, body.input as never));
        break;
      case "identity-get":
        data = await service.identity(actor, lease);
        break;
      case "items-list":
        data = await service.listItems(actor, lease);
        break;
      case "records-append":
        data = await service.appendRecords(actor, lease, body.input as never);
        break;
      default:
        return NextResponse.json({ success: false }, { status: 400 });
    }
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof VaultError) {
      const status = { INVALID: 400, NOT_FOUND: 404, LOCKED: 423, CONFLICT: 409 }[error.code];
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status });
    }
    if (error instanceof ConcurrentChangeError) {
      return NextResponse.json({ success: false, code: "CONFLICT", message: "Private Office changed in another tab. Please retry." }, { status: 409 });
    }
    if (isActionError(error) && error.code === "UNAUTHENTICATED") return NextResponse.json({ success: false }, { status: 401 });
    if (isActionError(error)) return notFound();
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
