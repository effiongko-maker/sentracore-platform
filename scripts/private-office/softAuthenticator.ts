/**
 * Verification-only software authenticator for the Private Office security verifiers.
 *
 * Produces standards-shaped WebAuthn registration ("none" attestation) and assertion responses that are
 * verified by the REAL @simplewebauthn/server code, and emulates the PRF extension the way browsers map it
 * onto CTAP hmac-secret: output = HMAC-SHA-256(credentialSecret, SHA-256("WebAuthn PRF" || 0x00 || salt)).
 * Never used by the application.
 */
import { createHash, createHmac, randomBytes, webcrypto } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { fromB64u, toB64u } from "../../src/modules/private-office/security/shared/encoding";

type Options = { origin: string; rpID: string; userVerified?: boolean; prf?: boolean; prfAtCreate?: boolean; backedUp?: boolean };

function derSignature(raw: Uint8Array): Uint8Array {
  const int = (bytes: Uint8Array) => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i += 1;
    let v = bytes.slice(i);
    if (v[0]! & 0x80) v = Uint8Array.from([0, ...v]);
    return Uint8Array.from([0x02, v.length, ...v]);
  };
  const r = int(raw.slice(0, 32));
  const s = int(raw.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

export class SoftAuthenticator {
  private keyPair!: CryptoKeyPair;
  private readonly credentialId = randomBytes(32);
  private readonly prfSecret = randomBytes(32);
  private counter = 0;
  /** Every PRF output this authenticator ever produced — so verifiers can prove none reached the server. */
  readonly prfOutputs: Uint8Array[] = [];

  constructor(private readonly options: Options) {}

  get id(): string {
    return toB64u(this.credentialId);
  }

  private prf(saltB64u: string): Uint8Array {
    const input = createHash("sha256").update(Buffer.concat([Buffer.from("WebAuthn PRF"), Buffer.from([0]), Buffer.from(fromB64u(saltB64u))])).digest();
    const out = new Uint8Array(createHmac("sha256", this.prfSecret).update(input).digest());
    this.prfOutputs.push(out);
    return out;
  }

  private flags(extra: number): number {
    const uv = this.options.userVerified === false ? 0 : 0x04;
    const backup = this.options.backedUp ? 0x08 | 0x10 : 0;
    return 0x01 | uv | backup | extra;
  }

  private clientData(type: string, challenge: string, origin = this.options.origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  async register(options: { challenge: string; extensions?: { prf?: { eval?: { first?: string } } } }, overrides: { origin?: string; rpID?: string } = {}) {
    this.keyPair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await webcrypto.subtle.exportKey("jwk", this.keyPair.publicKey);
    const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, fromB64u(jwk.x!)], [-3, fromB64u(jwk.y!)]]));
    const rpIdHash = createHash("sha256").update(overrides.rpID ?? this.options.rpID).digest();
    const authData = Buffer.concat([
      rpIdHash,
      Buffer.from([this.flags(0x40)]),
      Buffer.from([0, 0, 0, 0]),
      Buffer.alloc(16),
      Buffer.from([0, this.credentialId.length]),
      this.credentialId,
      Buffer.from(cose),
    ]);
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", new Uint8Array(authData)]]) as never);
    const salt = options.extensions?.prf?.eval?.first;
    const prfOutput = this.options.prf !== false && this.options.prfAtCreate && salt ? this.prf(salt) : null;
    return {
      response: {
        id: this.id,
        rawId: this.id,
        type: "public-key" as const,
        response: {
          clientDataJSON: toB64u(this.clientData("webauthn.create", options.challenge, overrides.origin)),
          attestationObject: toB64u(attestationObject),
          transports: ["internal"] as never,
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform" as const,
      },
      prfEnabled: this.options.prf !== false,
      prfOutput,
    };
  }

  async assert(options: { challenge: string; allowCredentials?: Array<{ id: string }>; extensions?: { prf?: { evalByCredential?: Record<string, { first: string }> } } }) {
    this.counter += 1;
    const authData = Buffer.concat([
      createHash("sha256").update(this.options.rpID).digest(),
      Buffer.from([this.flags(0)]),
      Buffer.from([(this.counter >>> 24) & 255, (this.counter >>> 16) & 255, (this.counter >>> 8) & 255, this.counter & 255]),
    ]);
    const clientDataJSON = this.clientData("webauthn.get", options.challenge);
    const signed = Buffer.concat([authData, createHash("sha256").update(clientDataJSON).digest()]);
    const raw = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.keyPair.privateKey, signed));
    const salt = options.extensions?.prf?.evalByCredential?.[this.id]?.first;
    return {
      response: {
        id: this.id,
        rawId: this.id,
        type: "public-key" as const,
        response: {
          clientDataJSON: toB64u(clientDataJSON),
          authenticatorData: toB64u(authData),
          signature: toB64u(derSignature(raw)),
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform" as const,
      },
      prfOutput: this.options.prf !== false && salt ? this.prf(salt) : null,
    };
  }
}
