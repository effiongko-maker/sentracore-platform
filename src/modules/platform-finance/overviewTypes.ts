/**
 * Finance Overview snapshot types — presentation aggregates over existing Finance data.
 * Not a second calculation engine for Free Cash / bank / AR / AP.
 */

export type FinanceOverviewMetricBucket = {
  count: number;
  totalAmount: number;
};

export type FinanceOverviewAttentionItem = {
  id: string;
  kind: "financial_requests_awaiting_review";
  label: string;
  detail: string;
  count: number;
  tone: "critical" | "warning" | "caution";
};

export type FinanceOverviewActivityItem = {
  id: string;
  at: string;
  label: string;
  detail: string | null;
  tone: "success" | "info" | "neutral";
};

export type FinanceOverviewAccountingSnapshot = {
  revenue: number | null;
  expenses: number | null;
  netProfit: number | null;
  journalEntries: number;
  unpostedItems: number;
  periodStatus: "open" | "closed" | "none";
  periodLabel: string | null;
};

export type FinanceOverviewSnapshot = {
  asOf: string;
  companies: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
  }>;
  selectedCompanyId: string | null;
  periods: Array<{
    id: string;
    companyId: string;
    year: number;
    month: number;
    status: "open" | "closed";
    label: string;
  }>;
  selectedPeriodId: string | null;
  selectedCompanyLabel: string;
  requests: {
    awaitingReview: FinanceOverviewMetricBucket;
    pendingCeoApproval: FinanceOverviewMetricBucket;
    queried: FinanceOverviewMetricBucket;
    approvedThisMonth: FinanceOverviewMetricBucket;
  };
  needsAttention: FinanceOverviewAttentionItem[];
  accounting: FinanceOverviewAccountingSnapshot;
  recentActivity: FinanceOverviewActivityItem[];
};
