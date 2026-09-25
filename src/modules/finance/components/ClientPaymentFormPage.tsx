"use client";

import { CostsClaimsNav } from "./CostsClaimsNav";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import { useReferenceCatalog } from "@/hooks/useReferenceCatalog";
import { FacilityService } from "@/services/facilities/FacilityService";
import { ApprovalService } from "@/modules/approvals/services/ApprovalService";
import { useToast } from "@/components/ui/Toast";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { DEFAULT_COST_SUBMISSION_CURRENCY } from "@/lib/operational/finance/costSubmission";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";
import { UserService } from "@/services/users/UserService";
import { CLIENT_PAYMENT_KIND_LABELS } from "../constants";

type Kind = "payment_request" | "contract_instalment";

/**
 * New Payment request / Contract instalment — a Client Payment billed to the client. No cost records and no
 * reimbursement authorization (those belong to Reimbursement claims, which keep their own workflow). The request is
 * recorded as submitted; receipts are then recorded against it (partial receipts supported).
 *
 * Work Order route: opened with a Work Order, it records the payment request billed for that Work Order. Every
 * commercial fact (what was requested, amount, date, reference) is still entered here — never taken from the Work.
 */
export function ClientPaymentFormPage({ initialKind, workOrderId }: { initialKind?: string; workOrderId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { can } = useOperatingAccess();
  const canCreate = can("finance.create");
  const forWorkOrder = workOrderId?.trim() || undefined;
  const [kind, setKind] = useState<Kind>(
    !forWorkOrder && initialKind === "contract_instalment" ? "contract_instalment" : "payment_request"
  );
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [submittedOn, setSubmittedOn] = useState("");
  const [amount, setAmount] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [clientLocation, setClientLocation] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [packageType, setPackageType] = useState("");
  const [packageDate, setPackageDate] = useState("");
  const [packageNotes, setPackageNotes] = useState("");
  const [notes, setNotes] = useState("");
  const facilities = useReferenceCatalog(canCreate, () => FacilityService.listFacilities({ page: 1, pageSize: 200 }).then((p) => p.data));
  const approvals = useReferenceCatalog(canCreate && can("ops.view"), () => ApprovalService.listApprovals({ page: 1, pageSize: 500 }).then((p) => p.data));
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    UserService.getCurrentUser()
      .then((user) => { if (!cancelled) setUserId(user.id); })
      .catch(() => { if (!cancelled) setUserId(null); });
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    const requested = Number(amount.replace(/,/g, ""));
    if (!description.trim()) return setError("Describe what was requested from the client.");
    if (!Number.isFinite(requested) || requested <= 0) return setError("Enter the requested amount.");
    if (!submittedOn) return setError("Enter the date the request was submitted to the client.");
    if (kind === "contract_instalment" && !periodLabel.trim()) return setError("Enter the instalment period.");
    if (!userId) return setError("Your user session could not be verified. Sign in again.");
    setSaving(true);
    setError(null);
    try {
      const record = await CostSubmissionService.createCostSubmission({
        submissionKind: kind,
        status: "submitted",
        currency: DEFAULT_COST_SUBMISSION_CURRENCY,
        costRecordIds: [],
        claimAmount: Math.round(requested * 100) / 100,
        description: description.trim(),
        periodLabel: kind === "contract_instalment" ? periodLabel.trim() : undefined,
        clientLocation: clientLocation.trim() || undefined,
        facilityId: facilityId || undefined,
        approvalId: approvalId || undefined,
        notes: notes.trim() || undefined,
        submissionPackage: {
          reference: reference.trim() || undefined,
          packageType: packageType.trim() || undefined,
          packageDate: packageDate ? `${packageDate}T00:00:00+01:00` : undefined,
          notes: packageNotes.trim() || undefined,
        },
        // Local date → WAT midnight (date-only input; no time is invented beyond the day).
        submittedAt: `${submittedOn}T00:00:00+01:00`,
        submittedBy: userId,
        createdBy: userId,
        workOrderId: forWorkOrder,
      });
      toast({ type: "success", title: `${CLIENT_PAYMENT_KIND_LABELS[kind]} recorded` });
      router.push(`/finance/submissions/${encodeURIComponent(record.submissionId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record the payment request.");
      setSaving(false);
    }
  }

  return (
    <ModeFrame mode="act">
      <div className="fin-page">
        <CostsClaimsNav />
        <div className="mb-4">
          <Link href="/finance" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Costs & Claims
          </Link>
        </div>
        <OperateHeader
          title={kind === "payment_request" ? "Raise payment request" : "Record contract instalment"}
          description="Record the request, supporting documents and current processing position. Follow-ups and receipts remain separate recorded events."
        />
        <StreamSurface className="mt-4">
          {!canCreate ? (
            <p className="fin-section-lede">You do not have permission to record pending payments.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
              {forWorkOrder ? (
                <FormField label="For Work Order" htmlFor="cp-wo">
                  <input id="cp-wo" className={inputClassName} value={forWorkOrder} readOnly disabled />
                </FormField>
              ) : (
              <FormField label="Type" htmlFor="cp-kind" required>
                <select id="cp-kind" className={inputClassName} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                  <option value="payment_request">{CLIENT_PAYMENT_KIND_LABELS.payment_request}</option>
                  <option value="contract_instalment">{CLIENT_PAYMENT_KIND_LABELS.contract_instalment}</option>
                </select>
              </FormField>
              )}
              <FormField label="Facility (optional)" htmlFor="cp-facility" hint={facilities.failed ? "Facilities could not be loaded. Retry before selecting a facility." : "Select the facility where this request belongs, when known."}>
                <select id="cp-facility" className={inputClassName} value={facilityId} onChange={(e) => setFacilityId(e.target.value)} disabled={facilities.loading || facilities.failed}>
                  <option value="">Not specified</option>
                  {facilities.items.filter((f) => f.status === "active").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {facilities.failed ? <Button type="button" variant="ghost" onClick={facilities.retry}>Retry facilities</Button> : null}
              </FormField>
              {can("ops.view") ? (
                <FormField label="Related Payment Approval (optional)" htmlFor="cp-approval" hint="Link only when this is the same request. An association does not record a decision or receipt.">
                  <select id="cp-approval" className={inputClassName} value={approvalId} onChange={(e) => setApprovalId(e.target.value)} disabled={approvals.loading || approvals.failed}>
                    <option value="">No linked approval</option>
                    {approvals.items.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.title}</option>)}
                  </select>
                  {approvals.failed ? <Button type="button" variant="ghost" onClick={approvals.retry}>Approvals unavailable — retry</Button> : null}
                </FormField>
              ) : null}
              <FormField label="Client reference (invoice / request no.)" htmlFor="cp-ref">
                <input id="cp-ref" className={inputClassName} value={reference} onChange={(e) => setReference(e.target.value)} />
              </FormField>
              <FormField label="Request description / scope" htmlFor="cp-desc" required>
                <textarea id="cp-desc" className={`${inputClassName} min-h-24`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </FormField>
              <FormField label="Submitted to client on" htmlFor="cp-date" required>
                <input id="cp-date" type="date" className={inputClassName} value={submittedOn} onChange={(e) => setSubmittedOn(e.target.value)} />
              </FormField>
              <FormField label="Requested amount (NGN)" htmlFor="cp-amount" required>
                <input id="cp-amount" inputMode="decimal" className={inputClassName} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormField>
              {kind === "contract_instalment" ? (
                <FormField label="Instalment period" htmlFor="cp-period" required>
                  <input id="cp-period" className={inputClassName} placeholder="e.g. September 2026" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} />
                </FormField>
              ) : null}
              <FormField label="Client location (current processing point)" htmlFor="cp-loc">
                <input id="cp-loc" className={inputClassName} value={clientLocation} onChange={(e) => setClientLocation(e.target.value)} />
              </FormField>
              <FormField label="Supporting document type" htmlFor="cp-package-type" hint="Use the actual document type, for example invoice or request letter.">
                <input id="cp-package-type" className={inputClassName} value={packageType} onChange={(e) => setPackageType(e.target.value)} />
              </FormField>
              <FormField label="Supporting document date" htmlFor="cp-package-date">
                <input id="cp-package-date" type="date" className={inputClassName} value={packageDate} onChange={(e) => setPackageDate(e.target.value)} />
              </FormField>
              <FormField label="Supporting documents / evidence references" htmlFor="cp-package-notes" hint="List document references and where they are held. This records references; it does not upload files.">
                <textarea id="cp-package-notes" rows={3} className={`${inputClassName} min-h-24`} value={packageNotes} onChange={(e) => setPackageNotes(e.target.value)} />
              </FormField>
              <FormField label="Current processing update / notes" htmlFor="cp-notes" hint="Record the known processing position. Add dated follow-up activity after saving.">
                <textarea id="cp-notes" rows={3} className={`${inputClassName} min-h-24`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
              {error ? <div className="fin-submission-error" role="alert">{error}</div> : null}
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <Button type="button" onClick={() => void submit()} disabled={saving}>
                  {saving ? "Recording…" : kind === "payment_request" ? "Record payment request" : "Record contract instalment"}
                </Button>
                <Link href="/finance/submissions/new" className="fin-v13-text-action self-center">
                  Recovering recorded costs? Create a reimbursement claim →
                </Link>
              </div>
            </div>
          )}
        </StreamSurface>
      </div>
    </ModeFrame>
  );
}
