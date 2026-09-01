"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import { workHref } from "@/lib/operational/work";
import type { LinkableSearchHit } from "../treatment/types";
import type { RequestTreatmentResult } from "../treatment/resultTypes";
import { filterLinkableCandidates } from "../treatment/filterLinkableCandidates";
import { loadLinkTreatmentCatalogue } from "../treatment/loadLinkTreatmentCatalogue";
import { linkMaintenanceToRequest } from "../actions/treatRequest";

interface LinkExistingTreatmentModalProps {
  open: boolean;
  requestId: string;
  onClose: () => void;
  onLinked: (result: RequestTreatmentResult) => void;
}

export function LinkExistingTreatmentModal({
  open,
  requestId,
  onClose,
  onLinked,
}: LinkExistingTreatmentModalProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<LinkableSearchHit[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const catalogueLoadGen = useRef(0);
  const openStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      catalogueLoadGen.current += 1;
      setSearch("");
      setCandidates([]);
      setCatalogueLoading(false);
      setCatalogueError(null);
      setLinkingId(null);
      openStartedAt.current = null;
      return;
    }

    const gen = ++catalogueLoadGen.current;
    openStartedAt.current = performance.now();
    setSearch("");
    setCandidates([]);
    setCatalogueError(null);
    setCatalogueLoading(true);

    void loadLinkTreatmentCatalogue({ requestId })
      .then((result) => {
        if (gen !== catalogueLoadGen.current) return;
        if (!result.success) {
          setCatalogueError(result.error.message);
          setCandidates([]);
          toast({
            type: "error",
            title: "Unable to load candidates",
            description: result.error.message,
          });
          return;
        }
        setCandidates(result.data.data);
        const openMs = openStartedAt.current;
        if (openMs != null && process.env.NODE_ENV !== "production") {
          console.info("[link-treatment.catalogue.timing]", {
            elapsedMs: Math.round(performance.now() - openMs),
            count: result.data.data.length,
          });
        }
      })
      .catch((error) => {
        if (gen !== catalogueLoadGen.current) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load linkable records.";
        setCatalogueError(message);
        setCandidates([]);
        toast({
          type: "error",
          title: "Unable to load candidates",
          description: message,
        });
      })
      .finally(() => {
        if (gen === catalogueLoadGen.current) {
          setCatalogueLoading(false);
        }
      });
  }, [open, requestId, toast]);

  const filtered = useMemo(() => {
    const t0 = performance.now();
    const next = filterLinkableCandidates(candidates, search);
    if (
      process.env.NODE_ENV !== "production" &&
      !catalogueLoading &&
      candidates.length > 0
    ) {
      console.info("[link-treatment.search.timing]", {
        queryLength: search.trim().length,
        elapsedMs: Math.round((performance.now() - t0) * 1000) / 1000,
        resultCount: next.length,
        remote: false,
      });
    }
    return next;
  }, [candidates, search, catalogueLoading]);

  async function handleLink(id: string) {
    setLinkingId(id);
    try {
      const result = await linkMaintenanceToRequest({ requestId, maintenanceId: id });

      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: "Work linked",
        description: `${id} is now linked to this request.`,
      });
      onLinked(result.data);
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to link",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setLinkingId(null);
    }
  }

  const title = "Link Work";
  const loadingLabel = "Loading work…";
  const emptyFilterLabel = "No matching work records";
  const searchPlaceholder = "Search work…";

  const showEmpty =
    !catalogueLoading &&
    !catalogueError &&
    filtered.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Search by ID or title within the same facility."
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="Search" htmlFor="link-treatment-search">
          <input
            id="link-treatment-search"
            className={inputClassName}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            disabled={catalogueLoading || Boolean(catalogueError)}
            autoComplete="off"
          />
        </FormField>

        <p className="text-xs text-muted">
          {catalogueLoading
            ? loadingLabel
            : catalogueError
              ? "Could not load candidates."
              : search.trim()
                ? `${filtered.length} matching · ${candidates.length} loaded`
                : `${candidates.length} linkable record${candidates.length === 1 ? "" : "s"}`}
        </p>

        <ul className="divide-y divide-border rounded-xl border border-border">
          {catalogueLoading ? (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {loadingLabel}
            </li>
          ) : null}
          {showEmpty ? (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {candidates.length === 0
                ? "No linkable records found."
                : emptyFilterLabel}
            </li>
          ) : null}
          {!catalogueLoading
            ? filtered.map((hit) => (
                <li
                  key={hit.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {hit.title}
                    </p>
                    <p className="text-xs text-muted">
                      {hit.id} · {hit.status} · {formatDate(hit.date)}
                      {hit.sourceRequestId
                        ? ` · already linked to this request`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={linkingId === hit.id}
                    onClick={() => void handleLink(hit.id)}
                  >
                    {linkingId === hit.id ? "Linking…" : "Link"}
                  </Button>
                </li>
              ))
            : null}
        </ul>
      </div>
    </Modal>
  );
}
