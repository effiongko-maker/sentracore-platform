"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import type { LinkableSearchHit } from "../treatment/types";
import {
  linkIncidentToRequest,
  linkMaintenanceToRequest,
  searchIncidentsForRequestLink,
  searchMaintenanceForRequestLink,
} from "../actions/treatRequest";

type LinkKind = "maintenance" | "incident";

interface LinkExistingTreatmentModalProps {
  open: boolean;
  kind: LinkKind;
  requestId: string;
  onClose: () => void;
  onLinked: () => void;
}

export function LinkExistingTreatmentModal({
  open,
  kind,
  requestId,
  onClose,
  onLinked,
}: LinkExistingTreatmentModalProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LinkableSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setQuery("");
    setHits([]);
    setTotal(0);
    setLoading(false);
  }, [open, kind, requestId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const runner =
      kind === "maintenance"
        ? searchMaintenanceForRequestLink
        : searchIncidentsForRequestLink;

    runner({ requestId, search: query, page: 1, pageSize: 8 })
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          toast({
            type: "error",
            title: "Search failed",
            description: result.error.message,
          });
          setHits([]);
          setTotal(0);
          return;
        }
        setHits(result.data.data);
        setTotal(result.data.total);
      })
      .catch((error) => {
        if (cancelled) return;
        toast({
          type: "error",
          title: "Search failed",
          description:
            error instanceof Error
              ? error.message
              : "Unable to search linkable records.",
        });
        setHits([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, kind, requestId, query, toast]);

  async function handleLink(id: string) {
    setLinkingId(id);
    try {
      const result =
        kind === "maintenance"
          ? await linkMaintenanceToRequest({ requestId, maintenanceId: id })
          : await linkIncidentToRequest({ requestId, incidentId: id });

      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: kind === "maintenance" ? "Maintenance linked" : "Incident linked",
        description: `${id} is now linked to this request.`,
      });
      onLinked();
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

  const title =
    kind === "maintenance" ? "Link existing Maintenance" : "Link existing Incident";

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
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
          }}
        >
          <FormField label="Search" htmlFor="link-treatment-search" className="flex-1">
            <input
              id="link-treatment-search"
              className={inputClassName}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ID or title"
            />
          </FormField>
          <div className="flex items-end">
            <Button type="submit" variant="secondary" disabled={loading}>
              Search
            </Button>
          </div>
        </form>

        <p className="text-xs text-muted">
          {loading ? "Searching…" : `${total} linkable record${total === 1 ? "" : "s"}`}
        </p>

        <ul className="divide-y divide-border rounded-xl border border-border">
          {hits.length === 0 && !loading ? (
            <li className="px-3 py-6 text-center text-sm text-muted">
              No linkable records found.
            </li>
          ) : null}
          {hits.map((hit) => (
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
          ))}
        </ul>
      </div>
    </Modal>
  );
}
