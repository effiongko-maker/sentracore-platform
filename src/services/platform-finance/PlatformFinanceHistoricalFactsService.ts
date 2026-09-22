import type {
  DerivedCommercialSpread,
  PlatformFinanceHistoricalCommercialFact,
} from "@/modules/platform-finance/domain/historicalCommercialFacts";
import type { HistoricalFactCapabilities } from "@/modules/platform-finance/server/PlatformFinanceHistoricalFactsServerService";

const API_PATH = "/api/platform-finance/historical-facts";

export type PresentedHistoricalFact = PlatformFinanceHistoricalCommercialFact & {
  derivedSpread: DerivedCommercialSpread | null;
};

export type HistoricalFactProvenance = {
  workbook: string;
  sourceSheet: string;
  sourceRow: number;
  sourceReference: string | null;
  classification: string;
};

export type PresentedHistoricalFactDetail = PresentedHistoricalFact & {
  provenance: HistoricalFactProvenance | null;
  workRef: { workCode: string | null; workTitle: string | null; workInstructionCode: string | null };
};

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string };

async function postAction<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new Error(("message" in json && json.message) || `Historical commercial facts action failed (${action}).`);
  }
  return json.data;
}

export const PlatformFinanceHistoricalFactsService = {
  getMyCapabilities(): Promise<HistoricalFactCapabilities> {
    return postAction("getMyHistoricalFactCapabilities");
  },
  list(): Promise<PresentedHistoricalFact[]> {
    return postAction("listHistoricalFacts");
  },
  get(idOrCode: { id: string } | { code: string }): Promise<PresentedHistoricalFactDetail> {
    return postAction("getHistoricalFact", idOrCode);
  },
};
