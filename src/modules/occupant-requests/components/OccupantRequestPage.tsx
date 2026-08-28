"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  ModeFrame,
  OperateHeader,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
const REQUESTS_HEADER = {
  title: "Requests",
  description:
    "Raise maintenance requests and incident reports for the facilities team.",
};

function RequestsFrame({ children }: { children: React.ReactNode }) {
  return (
    <ModeFrame mode="act">
      <OperateHeader
        title={REQUESTS_HEADER.title}
        description={REQUESTS_HEADER.description}
      />
      {children}
    </ModeFrame>
  );
}
import { OCCUPANT_REQUEST_KINDS } from "../constants";
import {
  submitOccupantIncidentReport,
  submitOccupantMaintenanceRequest,
} from "../actions/submitOccupantRequest";
import { useOccupantFacilities } from "../hooks/useOccupantFacilities";
import type {
  IncidentRequestFormValues,
  MaintenanceRequestFormValues,
  OccupantRequestKind,
  OccupantRequestResult,
} from "../types";
import { IncidentRequestForm } from "./IncidentRequestForm";
import { MaintenanceRequestForm } from "./MaintenanceRequestForm";
import { RequestStatusBadge } from "./RequestStatusBadge";

function KindIcon({ kind }: { kind: OccupantRequestKind }) {
  if (kind === "incident") {
    return <AlertTriangle className="h-5 w-5 text-primary" />;
  }
  return <Wrench className="h-5 w-5 text-primary" />;
}

export function OccupantRequestPage() {
  const searchParams = useSearchParams();
  const initialKind = useMemo(() => {
    const type = searchParams.get("type");
    return type === "incident" || type === "maintenance" ? type : null;
  }, [searchParams]);

  const { toast } = useToast();
  const { facilities, loading, error } = useOccupantFacilities();
  const [kind, setKind] = useState<OccupantRequestKind | null>(initialKind);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OccupantRequestResult | null>(null);

  async function submitMaintenance(values: MaintenanceRequestFormValues) {
    setSubmitting(true);
    try {
      const result = await submitOccupantMaintenanceRequest(values);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      setResult(result.data);
      toast({
        title: "Maintenance request submitted",
        description: "Your request is now with the facilities team.",
        type: "success",
      });
    } catch (err) {
      toast({
        title: "Unable to submit request",
        description:
          err instanceof Error ? err.message : "Please try again shortly.",
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitIncident(values: IncidentRequestFormValues) {
    setSubmitting(true);
    try {
      const result = await submitOccupantIncidentReport(values);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      setResult(result.data);
      toast({
        title: "Incident report submitted",
        description: "Your report is now with the operations team.",
        type: "success",
      });
    } catch (err) {
      toast({
        title: "Unable to submit report",
        description:
          err instanceof Error ? err.message : "Please try again shortly.",
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <RequestsFrame>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-sc border border-border/80 bg-slate-100/80"
            />
          ))}
        </div>
      </RequestsFrame>
    );
  }

  if (error && !facilities.length) {
    return (
      <RequestsFrame>
        <EmptyState title="Couldn’t load requests" description={error} />
      </RequestsFrame>
    );
  }

  if (result) {
    return (
      <RequestsFrame>
        <Card className="max-w-2xl">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Request submitted</CardTitle>
                <CardDescription className="mt-1">
                  {result.kind === "maintenance"
                    ? "Your maintenance request has been received. The facilities team will review it shortly."
                    : "Your incident report has been received. The operations team will review it shortly."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Reference
                </dt>
                <dd className="mt-1 font-medium text-foreground">{result.id}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Status
                </dt>
                <dd className="mt-1">
                  <RequestStatusBadge status={result.status} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Title
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {result.title}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted">
              Keep this reference number if you need to follow up on your
              report.
            </p>
            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
              <Button
                type="button"
                onClick={() => {
                  setResult(null);
                  setKind(result.kind);
                }}
              >
                Submit another
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setKind(null);
                }}
              >
                Back to request types
              </Button>
            </div>
          </CardContent>
        </Card>
      </RequestsFrame>
    );
  }

  return (
    <RequestsFrame>
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            What would you like to submit?
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Choose a request type to submit. Your report will be reviewed by the
            facilities team.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {OCCUPANT_REQUEST_KINDS.map((item) => {
            const selected = kind === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setKind(item.id)}
                className="h-full text-left"
                aria-pressed={selected}
              >
                <Card
                  className={cn(
                    "h-full border-2 transition-all duration-200",
                    selected
                      ? "border-primary bg-primary/[0.03] shadow-sc-lg"
                      : "border-border/70 shadow-sc hover:border-primary/25 hover:shadow-sc-lg"
                  )}
                >
                  <CardHeader className="gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/80 bg-white shadow-sc">
                        <KindIcon kind={item.id} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <CardDescription className="mt-1.5">
                          {item.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </button>
            );
          })}
        </div>
      </section>

      {kind ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {kind === "maintenance"
                ? "Maintenance request details"
                : "Incident report details"}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Provide the details below. Required fields are marked.
            </p>
          </div>

          <Card>
            <CardContent className="py-6">
              {kind === "maintenance" ? (
                <MaintenanceRequestForm
                  facilities={facilities}
                  submitting={submitting}
                  onSubmit={submitMaintenance}
                />
              ) : (
                <IncidentRequestForm
                  facilities={facilities}
                  submitting={submitting}
                  onSubmit={submitIncident}
                />
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </RequestsFrame>
  );
}
