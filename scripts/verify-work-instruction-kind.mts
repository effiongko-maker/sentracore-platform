import assert from "node:assert/strict";
import {
  resolveWorkInstructionKind,
  validateOrderTypeSelection,
  executionKindFromWorkInstruction,
} from "../src/modules/work-orders/instructionKind";

const results: string[] = [];

assert.equal(
  resolveWorkInstructionKind({ orderType: "work_order" }),
  "work_order",
  "WO + no cost"
);
assert.equal(
  resolveWorkInstructionKind({
    orderType: "work_order",
    estimatedCost: 500_000,
  }),
  "work_order",
  "WO + 500k"
);
assert.equal(
  resolveWorkInstructionKind({
    orderType: "work_order",
    estimatedCost: 2_500_000,
  }),
  "work_order",
  "WO + 2.5m"
);
assert.equal(
  resolveWorkInstructionKind({ orderType: "job_order" }),
  "job_order",
  "JO + no cost"
);
assert.equal(
  resolveWorkInstructionKind({
    orderType: "job_order",
    estimatedCost: 500_000,
  }),
  "job_order",
  "JO + 500k"
);
assert.equal(
  resolveWorkInstructionKind({
    orderType: "job_order",
    estimatedCost: 2_500_000,
  }),
  "job_order",
  "JO + 2.5m"
);
assert.equal(resolveWorkInstructionKind({}), "work_order", "legacy missing");
assert.equal(
  resolveWorkInstructionKind({ orderType: null }),
  "work_order",
  "legacy null"
);
assert.equal(
  resolveWorkInstructionKind({ orderType: "" }),
  "work_order",
  "legacy blank"
);
assert.equal(
  resolveWorkInstructionKind({ orderType: "not_a_kind" }),
  "work_order",
  "invalid → work_order"
);
assert.equal(
  resolveWorkInstructionKind({ estimatedCost: 2_500_000 }),
  "work_order",
  "cost alone never JO"
);
assert.equal(
  executionKindFromWorkInstruction({ orderType: "job_order" }),
  "job_order",
  "execution uses orderType"
);
assert.equal(
  executionKindFromWorkInstruction({ estimatedCost: 2_500_000 }),
  "work_order",
  "execution ignores cost"
);

assert.equal(validateOrderTypeSelection("work_order").ok, true);
assert.equal(validateOrderTypeSelection("job_order").ok, true);
assert.equal(validateOrderTypeSelection("").ok, false);
assert.equal(validateOrderTypeSelection(null).ok, false);

results.push("PASS explicit persisted Order Type domain rules");
console.log(results.join("\n"));
