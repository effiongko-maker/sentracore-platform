import {
  sendSignal,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { fromB64u } from "../shared/encoding";

/**
 * Private Office production security — WebAuthn + PRF in the browser.
 *
 * Ceremonies run through @simplewebauthn/browser. The PRF extension output is secret key material: it is
 * copied out locally and the ceremony response is rebuilt WITHOUT any extension results before it goes to
 * the server. The credential id, public key and signature are never used as key material.
 */

type PrfClientResults = { prf?: { enabled?: boolean; results?: { first?: BufferSource } } };

function copyBytes(source: BufferSource | undefined): Uint8Array<ArrayBuffer> | null {
  if (!source) return null;
  const view = source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  return view.length >= 32 ? new Uint8Array(view) : null;
}

export type PrfRegistration = {
  /** Safe to send: extension results removed. */
  response: RegistrationResponseJSON;
  prfEnabled: boolean | null;
  /** Secret. Stays in the browser. */
  prfOutput: Uint8Array<ArrayBuffer> | null;
  authenticatorAttachment: string | null;
  transports: string[];
};

export async function registerWithPrf(options: PublicKeyCredentialCreationOptionsJSON, prfSalt: string): Promise<PrfRegistration> {
  const optionsJSON = { ...options, extensions: { prf: { eval: { first: fromB64u(prfSalt) } } } } as unknown as PublicKeyCredentialCreationOptionsJSON;
  const result = await startRegistration({ optionsJSON });
  const prf = (result.clientExtensionResults as PrfClientResults).prf;
  return {
    response: { ...result, clientExtensionResults: {} },
    prfEnabled: typeof prf?.enabled === "boolean" ? prf.enabled : null,
    prfOutput: copyBytes(prf?.results?.first),
    authenticatorAttachment: result.authenticatorAttachment ?? null,
    transports: result.response.transports ?? [],
  };
}

export type PrfAuthentication = {
  response: AuthenticationResponseJSON;
  credentialId: string;
  prfOutput: Uint8Array<ArrayBuffer> | null;
  authenticatorAttachment: string | null;
};

export async function authenticateWithPrf(options: PublicKeyCredentialRequestOptionsJSON): Promise<PrfAuthentication> {
  const byCredential = (options.extensions as { prf?: { evalByCredential?: Record<string, { first: string }> } } | undefined)?.prf?.evalByCredential ?? {};
  const optionsJSON = {
    ...options,
    extensions: {
      prf: { evalByCredential: Object.fromEntries(Object.entries(byCredential).map(([id, v]) => [id, { first: fromB64u(v.first) }])) },
    },
  } as unknown as PublicKeyCredentialRequestOptionsJSON;
  const result = await startAuthentication({ optionsJSON });
  const prf = (result.clientExtensionResults as PrfClientResults).prf;
  return {
    response: { ...result, clientExtensionResults: {} },
    credentialId: result.id,
    prfOutput: copyBytes(prf?.results?.first),
    authenticatorAttachment: result.authenticatorAttachment ?? null,
  };
}

/** Best effort: ask the authenticator to forget a credential the server refused (e.g. no PRF). */
export async function forgetCredential(rpID: string, credentialID: string): Promise<void> {
  try {
    await sendSignal({ signalName: "unknownCredential", rpID, credentialID });
  } catch {
    // Signal API unsupported — the orphaned passkey must be removed by the user in their passkey manager.
  }
}

export async function environmentDiagnostics() {
  const pkc = typeof window !== "undefined" ? window.PublicKeyCredential : undefined;
  let platformAuthenticator: boolean | null = null;
  let clientCapabilityPrf: boolean | null = null;
  try {
    platformAuthenticator = pkc ? await pkc.isUserVerifyingPlatformAuthenticatorAvailable() : false;
  } catch {
    platformAuthenticator = null;
  }
  try {
    const caps = (pkc as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> })?.getClientCapabilities;
    if (caps) {
      const value = (await caps.call(pkc))["extension:prf"];
      clientCapabilityPrf = typeof value === "boolean" ? value : null;
    }
  } catch {
    clientCapabilityPrf = null;
  }
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  return {
    userAgent: navigator.userAgent,
    platform: uaData?.platform ?? navigator.platform ?? null,
    secureContext: window.isSecureContext,
    webauthn: Boolean(pkc),
    platformAuthenticator,
    clientCapabilityPrf,
  };
}

/** Well-known passkey-provider AAGUIDs (public registry values). Unknown ≠ unsupported. */
const PROVIDERS: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain (managed)",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "00000000-0000-0000-0000-000000000000": "not disclosed",
};

export function providerName(aaguid: string | null | undefined): string {
  if (!aaguid) return "unknown";
  return PROVIDERS[aaguid] ?? `unrecognised (${aaguid})`;
}
