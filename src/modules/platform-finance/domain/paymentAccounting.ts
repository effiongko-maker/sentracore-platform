import type { FinanceAccount, FinancePeriod, FinanceTransaction } from "@/modules/platform-finance/types";
import type { FinancePayment } from "./payments";

export type PaymentAccountingStatus = "pending" | "draft" | "posted";

export type PaymentAccountingSourceFinancialAccount =
  | {
      visibility: "visible";
      name: string;
      last4: string | null;
    }
  | {
      visibility: "restricted";
      label: "Restricted corporate financial account";
    };

export type PaymentAccountingPayment = Omit<
  FinancePayment,
  "sourceFinancialAccountId"
> & {
  sourceFinancialAccount: PaymentAccountingSourceFinancialAccount;
};

export type PaymentAccountingReview = {
  status: PaymentAccountingStatus;
  payment: PaymentAccountingPayment;
  payable: { id: string; payeeName: string; sourceType: string; sourceId: string };
  companyName: string;
  transaction: FinanceTransaction;
  debitAccount: FinanceAccount | null;
  creditAccount: FinanceAccount;
  period: FinancePeriod | null;
  journalEntryId: string | null;
};

export type PaymentAccountingWorkItem = {
  paymentId: string;
  payableId: string;
  companyId: string;
  payeeName: string;
  amount: number;
  currency: string;
  paymentDate: string;
  accountingStatus: PaymentAccountingStatus;
  transactionId: string | null;
  journalEntryId: string | null;
};
