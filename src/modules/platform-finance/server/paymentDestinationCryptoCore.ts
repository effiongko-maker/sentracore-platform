import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  paymentDestinationLast4,
  validatePaymentDestinationInput,
  type PaymentDestinationInput,
  type PaymentDestinationMutation,
} from "@/modules/platform-finance/domain/paymentDestination";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
export const PAYMENT_DESTINATION_KEY_VERSION = 1;
export const PAYMENT_DESTINATION_KEY_ENV = "PLATFORM_FINANCE_PAYMENT_DESTINATION_KEY_V1";

export type EncryptedPaymentDestination = {
  payment_method: "bank_transfer";
  bank_name: string;
  account_name: string;
  account_number_last4: string;
  account_number_ciphertext: string;
  account_number_iv: string;
  account_number_auth_tag: string;
  encryption_key_version: number;
};

type PaymentDestinationEnvironment = Readonly<Record<string, string | undefined>>;

function loadKey(env: PaymentDestinationEnvironment = process.env): Buffer {
  const encoded = env[PAYMENT_DESTINATION_KEY_ENV]?.trim();
  if (!encoded) throw new Error("Payment destination encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES || key.toString("base64") !== encoded) {
    throw new Error("Payment destination encryption configuration is invalid.");
  }
  return key;
}

export function encryptPaymentDestination(input: PaymentDestinationInput, env: PaymentDestinationEnvironment = process.env): EncryptedPaymentDestination {
  const value = validatePaymentDestinationInput(input);
  const key = loadKey(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value.accountNumber, "utf8"), cipher.final()]);
  return {
    payment_method: "bank_transfer",
    bank_name: value.bankName,
    account_name: value.accountName,
    account_number_last4: paymentDestinationLast4(value.accountNumber),
    account_number_ciphertext: ciphertext.toString("base64"),
    account_number_iv: iv.toString("base64"),
    account_number_auth_tag: cipher.getAuthTag().toString("base64"),
    encryption_key_version: PAYMENT_DESTINATION_KEY_VERSION,
  };
}

export function preparePaymentDestinationMutation(mutation: PaymentDestinationMutation | undefined): { action: "preserve" | "replace" | "remove"; encrypted: EncryptedPaymentDestination | null } {
  if (!mutation || mutation.action === "preserve") return { action: "preserve", encrypted: null };
  if (mutation.action === "remove") return { action: "remove", encrypted: null };
  return { action: "replace", encrypted: encryptPaymentDestination(mutation.destination) };
}

export function decryptPaymentDestinationAccountNumber(
  payload: Pick<EncryptedPaymentDestination, "account_number_ciphertext" | "account_number_iv" | "account_number_auth_tag" | "encryption_key_version">,
  env: PaymentDestinationEnvironment = process.env
): string {
  if (payload.encryption_key_version !== PAYMENT_DESTINATION_KEY_VERSION) throw new Error("Payment destination encryption key version is unavailable.");
  const decipher = createDecipheriv(ALGORITHM, loadKey(env), Buffer.from(payload.account_number_iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.account_number_auth_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.account_number_ciphertext, "base64")), decipher.final()]).toString("utf8");
}
