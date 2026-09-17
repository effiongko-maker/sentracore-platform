export const PAYMENT_DESTINATION_METHODS = ["bank_transfer"] as const;

export type PaymentDestinationMethod =
  (typeof PAYMENT_DESTINATION_METHODS)[number];

/** Masked, ordinary read model. Full numbers and cryptographic material are absent. */
export type PaymentDestination = {
  paymentMethod: PaymentDestinationMethod;
  bankName: string;
  accountName: string;
  accountNumberLast4: string;
};

/** Plaintext exists only at the authorised server write boundary. */
export type PaymentDestinationInput = {
  paymentMethod: PaymentDestinationMethod;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type PaymentDestinationMutation =
  | { action: "preserve" }
  | { action: "remove" }
  | { action: "replace"; destination: PaymentDestinationInput };

export function validatePaymentDestinationInput(
  value: PaymentDestinationInput
): PaymentDestinationInput {
  if (value.paymentMethod !== "bank_transfer") {
    throw new Error("Only bank_transfer payment destinations are supported.");
  }
  const bankName = value.bankName?.trim();
  const accountName = value.accountName?.trim();
  const accountNumber = value.accountNumber?.trim();
  if (!bankName || !accountName || !accountNumber) {
    throw new Error(
      "Payment destination must include bank name, account name, and account number."
    );
  }
  if (!/^[0-9]+$/.test(accountNumber)) {
    throw new Error("Payment destination account number must contain digits only.");
  }
  return {
    paymentMethod: "bank_transfer",
    bankName,
    accountName,
    accountNumber,
  };
}

export function paymentDestinationLast4(accountNumber: string): string {
  const normalized = accountNumber.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error("Payment destination account number must contain digits only.");
  }
  return normalized.slice(-4).padStart(4, "0");
}

export function maskedPaymentDestinationFromRow(row: {
  payment_method?: string | null;
  payment_bank_name?: string | null;
  payment_account_name?: string | null;
  payment_account_number_last4?: string | null;
}): PaymentDestination | null {
  if (
    row.payment_method !== "bank_transfer" ||
    !row.payment_bank_name ||
    !row.payment_account_name ||
    !row.payment_account_number_last4
  ) {
    return null;
  }
  return {
    paymentMethod: "bank_transfer",
    bankName: row.payment_bank_name,
    accountName: row.payment_account_name,
    accountNumberLast4: row.payment_account_number_last4,
  };
}
