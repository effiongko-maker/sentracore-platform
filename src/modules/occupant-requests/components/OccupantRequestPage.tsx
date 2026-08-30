"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Shield,
  ShieldCheck,
  UserRound,
  MessageSquareText,
  ClipboardCheck,
  Zap,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { submitOccupantMaintenanceRequest } from "../actions/submitOccupantRequest";
import { useOccupantFacilities } from "../hooks/useOccupantFacilities";
import type {
  ClientRequestFormValues,
  OccupantRequestResult,
} from "../types";
import {
  emptyClientRequestForm,
  toMaintenanceFormFromClient,
} from "../utils";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { SubmitRequestChrome } from "./SubmitRequestChrome";

type Step = 1 | 2 | 3;

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 1, label: "About you" },
  { id: 2, label: "What happened" },
  { id: 3, label: "Review & submit" },
];

const URGENCY: Array<{
  id: ClientRequestFormValues["urgency"];
  title: string;
  sub: string;
}> = [
  {
    id: "low",
    title: "Can wait",
    sub: "It can be handled during normal operations.",
  },
  {
    id: "medium",
    title: "Needs attention",
    sub: "It should be looked at soon.",
  },
  {
    id: "high",
    title: "Urgent",
    sub: "It needs attention as soon as possible.",
  },
];

function urgencyLabel(value: ClientRequestFormValues["urgency"]) {
  return URGENCY.find((item) => item.id === value)?.title ?? value;
}

export function OccupantRequestPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { facilities, loading, error } = useOccupantFacilities();
  const defaultFacilityId = useMemo(() => {
    const preferred =
      facilities.find((f) => f.id === "FAC-0001") ?? facilities[0];
    return preferred?.id ?? "";
  }, [facilities]);
  const facilityName = useMemo(() => {
    return (
      facilities.find((f) => f.id === defaultFacilityId)?.name ??
      "your workplace"
    );
  }, [facilities, defaultFacilityId]);

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OccupantRequestResult | null>(null);
  const [form, setForm] = useState<ClientRequestFormValues>(
    emptyClientRequestForm()
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof ClientRequestFormValues, string>>
  >({});

  useEffect(() => {
    if (!defaultFacilityId) return;
    setForm((prev) =>
      prev.facilityId ? prev : { ...prev, facilityId: defaultFacilityId }
    );
  }, [defaultFacilityId]);

  function patch<K extends keyof ClientRequestFormValues>(
    key: K,
    value: ClientRequestFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validateStep1(): boolean {
    const next: Partial<Record<keyof ClientRequestFormValues, string>> = {};
    if (!form.fullName.trim()) next.fullName = "Enter your full name.";
    if (!form.phone.trim()) next.phone = "Enter your phone number.";
    if (!form.email.trim()) next.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (!form.floor.trim()) next.floor = "Enter your floor.";
    if (!form.office.trim()) next.office = "Enter your office or room.";
    if (!form.facilityId && !defaultFacilityId) {
      next.facilityId = "Facility context is unavailable right now.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateStep2(): boolean {
    const next: Partial<Record<keyof ClientRequestFormValues, string>> = {};
    if (!form.title.trim()) next.title = "Tell us what the issue is.";
    if (!form.description.trim()) {
      next.description = "Add a short description of what happened.";
    }
    if (!form.urgency) next.urgency = "Choose how urgent this is.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleNext() {
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!validateStep2()) return;
      setStep(3);
    }
  }

  function handleBack() {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  }

  async function handleSubmit() {
    if (!validateStep1() || !validateStep2()) {
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const payload = toMaintenanceFormFromClient({
        ...form,
        facilityId: form.facilityId || defaultFacilityId,
      });
      const response = await submitOccupantMaintenanceRequest(payload);
      if (!response.success) throw new Error(response.error.message);
      setResult(response.data);
      toast({
        title: "Request received",
        description: "The Facilities Team will follow up as needed.",
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

  function resetForm() {
    setResult(null);
    setStep(1);
    setForm(emptyClientRequestForm(defaultFacilityId));
    setErrors({});
  }

  if (loading) {
    return (
      <SubmitRequestChrome>
        <div className="sr-body">
          <p className="sr-state">Preparing your request form…</p>
        </div>
      </SubmitRequestChrome>
    );
  }

  if (error && !facilities.length) {
    return (
      <SubmitRequestChrome>
        <div className="sr-body">
          <EmptyState title="Something went wrong" description={error} />
        </div>
      </SubmitRequestChrome>
    );
  }

  if (result) {
    return (
      <SubmitRequestChrome>
        <div className="sr-body sr-body-single">
          <div className="sr-main">
            <div className="sr-success">
              <CheckCircle2 className="sr-success-icon" aria-hidden />
              <h2>Request received.</h2>
              <p>
                We&apos;ve received your request. The Facilities Team will
                review it and follow up as needed.
              </p>

              <div className="sr-reference">
                <p className="sr-reference-label">Reference</p>
                <p className="sr-reference-value">{result.id}</p>
                <p className="sr-reference-hint">
                  Keep this reference number to track your request.
                </p>
              </div>

              <dl className="sr-review">
                <div className="sr-review-row">
                  <dt>Status</dt>
                  <dd>
                    <RequestStatusBadge status={result.status} />
                  </dd>
                </div>
                <div className="sr-review-row">
                  <dt>Issue</dt>
                  <dd>{result.title}</dd>
                </div>
              </dl>

              <div className="sr-actions">
                <button
                  type="button"
                  className="sr-btn"
                  onClick={resetForm}
                >
                  Submit another request
                </button>
                <button
                  type="button"
                  className="sr-btn sr-btn-primary"
                  onClick={() =>
                    router.push(
                      `/occupant-requests/track?ref=${encodeURIComponent(result.id)}`
                    )
                  }
                >
                  Track your request →
                </button>
              </div>
            </div>
          </div>
        </div>
      </SubmitRequestChrome>
    );
  }

  return (
    <SubmitRequestChrome>
      <div className="sr-body">
        <aside className="sr-aside" aria-label="About this service">
          <p className="sr-aside-kicker">Facility support</p>
          <h1 className="sr-aside-title">
            Tell us
            <br />
            what&apos;s wrong.
            <br />
            We&apos;ll take it
            <br />
            from here.
          </h1>
          <p className="sr-aside-copy">
            Report a problem at {facilityName}. No need to choose categories or
            systems — just tell us what happened.
          </p>
          <Image
            src="/facilities/ncc-annex.jpg"
            alt=""
            width={640}
            height={480}
            className="sr-aside-image"
            priority
          />
          <div className="sr-benefits">
            <div className="sr-benefit">
              <span className="sr-benefit-icon">
                <Zap aria-hidden />
              </span>
              <p className="sr-benefit-title">Quick &amp; Easy</p>
              <p className="sr-benefit-sub">Submit in minutes</p>
            </div>
            <div className="sr-benefit">
              <span className="sr-benefit-icon">
                <Shield aria-hidden />
              </span>
              <p className="sr-benefit-title">Secure</p>
              <p className="sr-benefit-sub">Your details stay safe</p>
            </div>
            <div className="sr-benefit">
              <span className="sr-benefit-icon">
                <CheckCircle2 aria-hidden />
              </span>
              <p className="sr-benefit-title">Tracked</p>
              <p className="sr-benefit-sub">Follow up with your reference</p>
            </div>
          </div>
        </aside>

        <div className="sr-main">
          <div className="sr-stepper">
            <div className="sr-steps" role="list">
              {STEPS.map((item) => (
                <div
                  key={item.id}
                  role="listitem"
                  className={cn(
                    "sr-step",
                    step === item.id && "is-active",
                    step > item.id && "is-done"
                  )}
                >
                  <span className="sr-step-num">{item.id}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <span className="sr-assurance">
              <ShieldCheck aria-hidden />
              Your request is important to us
            </span>
          </div>

          {step === 1 ? (
            <>
              <div className="sr-section-head">
                <span className="sr-section-icon">
                  <UserRound aria-hidden />
                </span>
                <div>
                  <h2 className="sr-section-title">First, tell us about you.</h2>
                  <p className="sr-section-sub">
                    We&apos;ll use these details to contact you about your
                    request.
                  </p>
                </div>
              </div>

              <div className="sr-grid-2">
                <div className="sr-field" style={{ marginTop: 0 }}>
                  <label className="sr-label" htmlFor="sr-name">
                    Full name<span className="req">*</span>
                  </label>
                  <input
                    id="sr-name"
                    className="sr-input"
                    value={form.fullName}
                    onChange={(e) => patch("fullName", e.target.value)}
                    placeholder="e.g. Jane Doe"
                    autoComplete="name"
                    disabled={submitting}
                  />
                  {errors.fullName ? (
                    <p className="sr-error">{errors.fullName}</p>
                  ) : null}
                </div>
                <div className="sr-field" style={{ marginTop: 0 }}>
                  <label className="sr-label" htmlFor="sr-phone">
                    Phone number<span className="req">*</span>
                  </label>
                  <input
                    id="sr-phone"
                    className="sr-input"
                    value={form.phone}
                    onChange={(e) => patch("phone", e.target.value)}
                    placeholder="e.g. 0801 234 5678"
                    autoComplete="tel"
                    inputMode="tel"
                    disabled={submitting}
                  />
                  {errors.phone ? (
                    <p className="sr-error">{errors.phone}</p>
                  ) : null}
                </div>
              </div>

              <div className="sr-field">
                <label className="sr-label" htmlFor="sr-email">
                  Email address<span className="req">*</span>
                </label>
                <input
                  id="sr-email"
                  className="sr-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => patch("email", e.target.value)}
                  placeholder="e.g. jane.doe@organisation.com"
                  autoComplete="email"
                  disabled={submitting}
                />
                {errors.email ? (
                  <p className="sr-error">{errors.email}</p>
                ) : null}
              </div>

              <div className="sr-grid-2" data-testid="sr-floor-office-row">
                <div className="sr-field" style={{ marginTop: 0 }}>
                  <label className="sr-label" htmlFor="sr-floor">
                    Floor<span className="req">*</span>
                  </label>
                  <input
                    id="sr-floor"
                    className="sr-input"
                    value={form.floor}
                    onChange={(e) => patch("floor", e.target.value)}
                    placeholder="e.g. 3rd Floor"
                    disabled={submitting}
                  />
                  {errors.floor ? (
                    <p className="sr-error">{errors.floor}</p>
                  ) : null}
                </div>
                <div className="sr-field" style={{ marginTop: 0 }}>
                  <label className="sr-label" htmlFor="sr-office">
                    Office / room<span className="req">*</span>
                  </label>
                  <input
                    id="sr-office"
                    className="sr-input"
                    value={form.office}
                    onChange={(e) => patch("office", e.target.value)}
                    placeholder="e.g. Room 304"
                    disabled={submitting}
                  />
                  {errors.office ? (
                    <p className="sr-error">{errors.office}</p>
                  ) : null}
                </div>
              </div>

              {facilityName ? (
                <p className="sr-context-line">
                  Submitting for <strong>{facilityName}</strong>
                </p>
              ) : null}
              {errors.facilityId ? (
                <p className="sr-error">{errors.facilityId}</p>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="sr-section-head">
                <span className="sr-section-icon">
                  <MessageSquareText aria-hidden />
                </span>
                <div>
                  <h2 className="sr-section-title">
                    What do you need help with?
                  </h2>
                  <p className="sr-section-sub">
                    Tell us what happened and we&apos;ll take it from here.
                  </p>
                </div>
              </div>

              <div className="sr-field" style={{ marginTop: 0 }}>
                <label className="sr-label" htmlFor="sr-issue">
                  What&apos;s the issue?<span className="req">*</span>
                </label>
                <input
                  id="sr-issue"
                  className="sr-input"
                  value={form.title}
                  onChange={(e) => patch("title", e.target.value)}
                  placeholder="e.g. Air conditioner is not working"
                  disabled={submitting}
                />
                {errors.title ? (
                  <p className="sr-error">{errors.title}</p>
                ) : null}
              </div>

              <div className="sr-field">
                <label className="sr-label" htmlFor="sr-description">
                  Description<span className="req">*</span>
                </label>
                <textarea
                  id="sr-description"
                  className="sr-textarea"
                  value={form.description}
                  onChange={(e) => patch("description", e.target.value)}
                  placeholder="Tell us what happened, when you noticed it, and anything else that may help us."
                  disabled={submitting}
                />
                {errors.description ? (
                  <p className="sr-error">{errors.description}</p>
                ) : null}
              </div>

              <div className="sr-field">
                <label className="sr-label">
                  How urgent is this?<span className="req">*</span>
                </label>
                <div className="sr-choice-row">
                  {URGENCY.map((item) => {
                    const selected = form.urgency === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "sr-choice",
                          selected && "is-selected"
                        )}
                        aria-label={item.title}
                        aria-pressed={selected}
                        onClick={() => patch("urgency", item.id)}
                        disabled={submitting}
                      >
                        <p className="sr-choice-title">
                          <span
                            className={`sr-dot is-${item.id}`}
                            aria-hidden
                          />
                          {item.title}
                        </p>
                        <p className="sr-choice-sub">{item.sub}</p>
                      </button>
                    );
                  })}
                </div>
                {errors.urgency ? (
                  <p className="sr-error">{errors.urgency}</p>
                ) : null}
              </div>

              <div className="sr-field">
                <label className="sr-label" htmlFor="sr-attachment">
                  Attachment <span className="sr-optional">(optional)</span>
                </label>
                <input
                  id="sr-attachment"
                  type="file"
                  className="sr-input"
                  onChange={(e) =>
                    patch("attachment", e.target.files?.[0] ?? null)
                  }
                  disabled={submitting}
                />
                <p className="sr-hint">
                  Add a photo if it helps explain the issue.
                </p>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="sr-section-head">
                <span className="sr-section-icon">
                  <ClipboardCheck aria-hidden />
                </span>
                <div>
                  <h2 className="sr-section-title">Review your request</h2>
                  <p className="sr-section-sub">
                    Confirm the details below, then submit.
                  </p>
                </div>
              </div>

              <p className="sr-review-group">Your details</p>
              <dl className="sr-review">
                <div className="sr-review-row">
                  <dt>Name</dt>
                  <dd>{form.fullName}</dd>
                </div>
                <div className="sr-review-row">
                  <dt>Phone</dt>
                  <dd>{form.phone}</dd>
                </div>
                <div className="sr-review-row">
                  <dt>Email</dt>
                  <dd>{form.email}</dd>
                </div>
                <div className="sr-review-row">
                  <dt>Floor</dt>
                  <dd>{form.floor}</dd>
                </div>
                <div className="sr-review-row">
                  <dt>Office / room</dt>
                  <dd>{form.office}</dd>
                </div>
              </dl>

              <p className="sr-review-group">Your request</p>
              <dl className="sr-review">
                <div className="sr-review-row">
                  <dt>Issue</dt>
                  <dd>{form.title}</dd>
                </div>
                <div className="sr-review-row">
                  <dt>Description</dt>
                  <dd>{form.description}</dd>
                </div>
                <div className="sr-review-row">
                  <dt>Urgency</dt>
                  <dd>{urgencyLabel(form.urgency)}</dd>
                </div>
                <div className="sr-review-row">
                  <dt>Attachment</dt>
                  <dd>{form.attachment?.name || "None"}</dd>
                </div>
              </dl>
            </>
          ) : null}

          <div className="sr-actions">
            {step > 1 ? (
              <button
                type="button"
                className="sr-btn"
                onClick={handleBack}
                disabled={submitting}
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <button
                type="button"
                className="sr-btn sr-btn-primary"
                onClick={handleNext}
                disabled={submitting}
              >
                {step === 1 ? "Next: What happened →" : "Next: Review →"}
              </button>
            ) : (
              <button
                type="button"
                className="sr-btn sr-btn-primary"
                onClick={() => void handleSubmit()}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            )}
          </div>

          {step === 1 ? (
            <aside className="sr-track-entry" aria-label="Track a request">
              <p className="sr-track-entry-title">Already submitted a request?</p>
              <p className="sr-track-entry-copy">
                Enter your reference number to check its status.
              </p>
              <button
                type="button"
                className="sr-track-entry-link"
                onClick={() => router.push("/occupant-requests/track")}
              >
                Track a request →
              </button>
            </aside>
          ) : null}
        </div>
      </div>
    </SubmitRequestChrome>
  );
}
