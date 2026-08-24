"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrganisationIntelligence } from "@/lib/intelligence";
import {
  buildBriefingViewModel,
  layerCount,
  layerFindings,
  layerPrimary,
  type BriefingFinding,
  type BriefingLayer,
} from "../view-model/buildBriefingViewModel";
import { AttentionComposition } from "./AttentionComposition";
import { BriefingContextStrip } from "./BriefingContextStrip";
import { BriefingDetailPanel } from "./BriefingDetailPanel";
import { BriefingLayerRail } from "./BriefingLayerRail";
import { BriefingStatement } from "./BriefingStatement";
import { ChangeComposition } from "./ChangeComposition";
import { IntelligenceChrome } from "./IntelligenceChrome";
import { PatternsComposition } from "./PatternsComposition";
import { BriefingCalmStage } from "./BriefingCalmStage";

function resolveFocal(
  layer: BriefingLayer,
  vm: ReturnType<typeof buildBriefingViewModel>,
  focusedId: string | null
): BriefingFinding | null {
  const findings = layerFindings(vm, layer);
  if (focusedId) {
    return findings.find((f) => f.id === focusedId) ?? layerPrimary(vm, layer);
  }
  return layerPrimary(vm, layer);
}

function resolveOrbit(
  layer: BriefingLayer,
  vm: ReturnType<typeof buildBriefingViewModel>,
  focal: BriefingFinding | null
): BriefingFinding[] {
  const all = layerFindings(vm, layer);
  if (!focal) return all.slice(1);
  return all.filter((f) => f.id !== focal.id);
}

export function IntelligenceExperience({
  data,
}: {
  data: OrganisationIntelligence;
}) {
  const vm = useMemo(() => buildBriefingViewModel(data), [data]);
  const [layer, setLayer] = useState<BriefingLayer>("attention");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const focal = resolveFocal(layer, vm, focusedId);
  const orbit = resolveOrbit(layer, vm, focal);

  const selectFinding = useCallback((finding: BriefingFinding) => {
    setFocusedId(finding.id);
    setDetailOpen(true);
  }, []);

  const switchLayer = useCallback((next: BriefingLayer) => {
    setLayer(next);
    setFocusedId(null);
    setDetailOpen(false);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "1") switchLayer("attention");
      if (e.key === "2") switchLayer("change");
      if (e.key === "3") switchLayer("patterns");
      if (e.key === "Escape") {
        setDetailOpen(false);
        setFocusedId(null);
      }
      const findings = layerFindings(vm, layer);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const ids = findings.map((f) => f.id);
        const current = focusedId ?? focal?.id;
        const idx = current ? ids.indexOf(current) : -1;
        const nextIdx =
          e.key === "ArrowDown"
            ? Math.min(idx + 1, ids.length - 1)
            : Math.max(idx - 1, 0);
        if (ids[nextIdx]) {
          setFocusedId(ids[nextIdx]);
          setDetailOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layer, vm, focusedId, focal?.id, switchLayer]);

  const showCalmStage =
    !vm.processing &&
    layer === "attention" &&
    vm.attentionFindings.length === 0 &&
    (vm.posture === "steady" || vm.posture === "movement" || vm.posture === "waiting");

  const showChangeCalm =
    !vm.processing && layer === "change" && vm.changeFindings.length === 0;

  const showPatternsCalm =
    !vm.processing && layer === "patterns" && vm.patternFindings.length === 0;

  const hasDetail = detailOpen && focal !== null;

  return (
    <>
      <IntelligenceChrome />
      <div
        className={`ix-experience${hasDetail ? " ix-experience-with-detail" : ""}`}
      >
        <BriefingLayerRail
          active={layer}
          counts={{
            attention: layerCount(vm, "attention"),
            change: layerCount(vm, "change"),
            patterns: layerCount(vm, "patterns"),
          }}
          windowDays={vm.windowDays}
          onSelect={switchLayer}
        />

        <div className="ix-stage ix-stage-enter" key={layer}>
          <BriefingStatement vm={vm} layer={layer} />

          {vm.processing && layer !== "attention" ? (
            <BriefingCalmStage
              headline="Analysis in progress"
              copy="This layer will populate as SentraCore completes processing."
            />
          ) : null}

          {!vm.processing && layer === "attention" && !showCalmStage && focal ? (
            <AttentionComposition
              focal={focal}
              orbit={orbit}
              selectedId={focusedId}
              onSelect={selectFinding}
            />
          ) : null}

          {showCalmStage ? (
            <BriefingCalmStage
              headline={
                vm.posture === "waiting"
                  ? "No operational signal yet"
                  : "Nothing requires action now"
              }
              copy={
                vm.posture === "waiting"
                  ? "SentraCore needs more activity before it can surface priorities for this organisation."
                  : "Use the layer rail to explore movement and patterns forming in the operation."
              }
            />
          ) : null}

          {!vm.processing && layer === "change" && !showChangeCalm && focal ? (
            <ChangeComposition
              focal={focal}
              orbit={orbit}
              selectedId={focusedId}
              onSelect={selectFinding}
            />
          ) : null}

          {showChangeCalm ? (
            <BriefingCalmStage
              headline="The operation is holding steady"
              copy="No meaningful changes were detected in the last comparison period."
            />
          ) : null}

          {!vm.processing && layer === "patterns" && !showPatternsCalm ? (
            <PatternsComposition
              findings={layerFindings(vm, "patterns")}
              selectedId={focusedId}
              onSelect={selectFinding}
            />
          ) : null}

          {showPatternsCalm ? (
            <BriefingCalmStage
              headline="Nothing notable yet"
              copy="SentraCore has not identified patterns worth surfacing in this period."
            />
          ) : null}

          <BriefingContextStrip vm={vm} />
        </div>

        {hasDetail && focal ? (
          <BriefingDetailPanel
            finding={focal}
            onClose={() => {
              setDetailOpen(false);
              setFocusedId(null);
            }}
          />
        ) : null}
      </div>
    </>
  );
}
