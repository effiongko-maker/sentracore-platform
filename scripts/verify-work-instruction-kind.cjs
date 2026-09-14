/** Explicit persisted Order Type — estimated cost never classifies. */

function resolveWorkInstructionKind(input) {
  const raw = input && input.orderType != null ? String(input.orderType).trim() : "";
  if (!raw) return "work_order";
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "work_order" || normalized === "job_order") return normalized;
  return "work_order";
}

function validateOrderTypeSelection(orderType) {
  const normalized =
    orderType == null
      ? ""
      : String(orderType).trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized !== "work_order" && normalized !== "job_order") {
    return { ok: false };
  }
  return { ok: true, kind: normalized };
}

function assert(cond, message) {
  if (!cond) {
    console.error("FAIL", message);
    process.exit(1);
  }
}

assert(
  resolveWorkInstructionKind({ orderType: "work_order" }) === "work_order",
  "WO + no cost"
);
assert(
  resolveWorkInstructionKind({
    orderType: "work_order",
    estimatedCost: 500000,
  }) === "work_order",
  "WO + 500k"
);
assert(
  resolveWorkInstructionKind({
    orderType: "work_order",
    estimatedCost: 2500000,
  }) === "work_order",
  "WO + 2.5m"
);
assert(
  resolveWorkInstructionKind({ orderType: "job_order" }) === "job_order",
  "JO + no cost"
);
assert(
  resolveWorkInstructionKind({
    orderType: "job_order",
    estimatedCost: 500000,
  }) === "job_order",
  "JO + 500k"
);
assert(
  resolveWorkInstructionKind({
    orderType: "job_order",
    estimatedCost: 2500000,
  }) === "job_order",
  "JO + 2.5m"
);
assert(resolveWorkInstructionKind({}) === "work_order", "legacy missing");
assert(
  resolveWorkInstructionKind({ orderType: null }) === "work_order",
  "legacy null"
);
assert(
  resolveWorkInstructionKind({ orderType: "" }) === "work_order",
  "legacy blank"
);
assert(
  resolveWorkInstructionKind({ orderType: "garbage" }) === "work_order",
  "invalid → work_order not job_order"
);
assert(
  resolveWorkInstructionKind({ orderType: "JOB ORDER" }) === "job_order",
  "label normalize"
);
assert(
  resolveWorkInstructionKind({ estimatedCost: 2500000 }) === "work_order",
  "cost alone never classifies as JO"
);

assert(validateOrderTypeSelection("work_order").ok === true, "valid WO");
assert(validateOrderTypeSelection("job_order").ok === true, "valid JO");
assert(validateOrderTypeSelection("").ok === false, "empty reject");
assert(validateOrderTypeSelection(null).ok === false, "null reject");
assert(validateOrderTypeSelection("garbage").ok === false, "invalid reject");

console.log(
  "PASS explicit persisted Order Type; estimated cost ignored; legacy → work_order"
);
