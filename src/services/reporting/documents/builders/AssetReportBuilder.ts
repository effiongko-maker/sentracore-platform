import type { ReportingSnapshot } from "@/services/reporting/types";
import type { AssetReportDocument, DocumentBuildContext } from "../types";
import {
  buildCoverLetter,
  formatPercent,
  recommendationBullets,
} from "./shared";

export function buildAssetReportDocument(
  snapshot: ReportingSnapshot,
  context: DocumentBuildContext
): AssetReportDocument {
  const { kpis, assets } = snapshot;

  const rows = assets.slice(0, 100).map((a) => ({
    id: a.id,
    name: a.name,
    facility: a.facility,
    category: a.category,
    condition: a.condition,
    status: a.status,
    criticality: a.criticality,
  }));

  const fields = {
    facilityName: context.facilityName ?? "Portfolio",
    reportingPeriod: context.period.label,
    generatedAt: context.generatedAt,
    totalAssets: kpis.totalAssets,
    activeAssets: kpis.activeAssets,
    assetAvailability: formatPercent(kpis.assetsOperationalPercent),
    assetsInPoorCondition: kpis.assetsInPoorCondition,
    recommendations: recommendationBullets(snapshot).join(" | "),
  };

  return {
    kind: "asset",
    title: "Asset Report",
    subtitle: `${fields.facilityName} — ${context.period.label}`,
    context,
    coverLetter: buildCoverLetter({
      context,
      reportTitle: "Asset Report",
      highlights: [
        `${kpis.totalAssets} assets`,
        `Availability ${fields.assetAvailability}`,
      ],
    }),
    fields,
    sections: [
      {
        id: "summary",
        title: "Asset Summary",
        metrics: [
          { key: "total", label: "Total assets", value: kpis.totalAssets },
          { key: "active", label: "Active", value: kpis.activeAssets },
          {
            key: "availability",
            label: "Operational %",
            value: fields.assetAvailability,
          },
          {
            key: "poor",
            label: "Poor condition",
            value: kpis.assetsInPoorCondition,
          },
        ],
      },
      {
        id: "register",
        title: "Asset Register",
        rows,
      },
      {
        id: "recommendations",
        title: "Recommendations",
        bullets: recommendationBullets(snapshot),
      },
    ],
  };
}
