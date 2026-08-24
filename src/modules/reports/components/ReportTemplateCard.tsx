"use client";

import {
  AlertTriangle,
  CalendarRange,
  Check,
  FileBarChart2,
  FileText,
  Layers3,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportOutputFormat, ReportTypeDefinition, ReportTypeId } from "../types";

const TYPE_ICONS: Record<ReportTypeId, typeof FileText> = {
  monthly_operations: FileText,
  weekly_operations: CalendarRange,
  quarterly_review: Layers3,
  incident_report: AlertTriangle,
  maintenance_report: Wrench,
  executive_summary: FileBarChart2,
};

function formatOutputLabel(format: ReportOutputFormat): string {
  switch (format) {
    case "Word":
      return "DOCX";
    case "Excel":
      return "XLSX";
    default:
      return format;
  }
}

function formatAudience(audience: string[]): string {
  if (audience.length <= 1) return audience[0] ?? "";
  if (audience.length === 2) return `${audience[0]} and ${audience[1]}`;
  return `${audience.slice(0, -1).join(", ")}, and ${audience[audience.length - 1]}`;
}

export function ReportTemplateCard({
  item,
  selected,
  onSelect,
}: {
  item: ReportTypeDefinition;
  selected: boolean;
  onSelect: (id: ReportTypeId) => void;
}) {
  const Icon = TYPE_ICONS[item.id];

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-pressed={selected}
      className={cn("rp-card", selected && "rp-card-selected")}
    >
      <div className="rp-card-top">
        <span className="rp-card-icon" aria-hidden>
          <Icon className="h-4 w-4" strokeWidth={1.6} />
        </span>
      </div>

      <span className="rp-card-selected-badge">
        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        Selected
      </span>

      <h3 className="rp-card-title">{item.title}</h3>
      <p className="rp-card-desc">{item.description}</p>

      <div className="rp-includes">
        <p className="rp-micro">Includes</p>
        <ul className="rp-include-list">
          {item.includes.map((label) => (
            <li key={label} className="rp-include-item">
              <Check className="rp-include-mark" strokeWidth={2.25} aria-hidden />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rp-card-footer">
        <div className="rp-card-meta">
          <div className="rp-meta-block">
            <p className="rp-micro">Best for</p>
            <p className="rp-meta-value">{formatAudience(item.audience)}</p>
          </div>
          <div className="rp-meta-block">
            <p className="rp-micro">Formats</p>
            <p className="rp-formats">
              {item.outputs.map(formatOutputLabel).join(" · ")}
            </p>
          </div>
        </div>

        <span className="rp-card-action" aria-hidden>
          {selected ? "Continue below →" : "Select report →"}
        </span>
      </div>
    </button>
  );
}
