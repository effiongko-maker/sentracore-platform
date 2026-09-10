/**
 * Live Operational Registers write-path verification.
 *
 * Hits APPS_SCRIPT_URL / NEXT_PUBLIC_API_URL directly (same contract as the
 * Next.js proxy) and exercises create → list for all seven registers.
 *
 *   npm run verify-operational-registers-write
 *
 * Does not invent UI or domain logic — uses Apps Script field contracts.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type AppsScriptResponse = {
  success?: boolean;
  message?: string;
  data?: {
    id?: string;
    hours?: number;
    consumption?: number;
    closing?: number;
    data?: Array<{ id?: string }>;
    total?: number;
  } | null;
};

function loadAppsScriptUrl(): string {
  const fromEnv =
    process.env.APPS_SCRIPT_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv;
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) {
    throw new Error("Missing APPS_SCRIPT_URL / NEXT_PUBLIC_API_URL and .env.local");
  }
  const text = readFileSync(envPath, "utf8");
  const match =
    text.match(/^APPS_SCRIPT_URL=(.+)$/m) ||
    text.match(/^NEXT_PUBLIC_API_URL=(.+)$/m);
  const url = match?.[1]?.trim();
  if (!url) {
    throw new Error("APPS_SCRIPT_URL / NEXT_PUBLIC_API_URL not found in .env.local");
  }
  return url;
}

async function postAppsScript(
  url: string,
  body: Record<string, unknown>
): Promise<AppsScriptResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as AppsScriptResponse;
  } catch {
    throw new Error(`Non-JSON Apps Script response: ${text.slice(0, 240)}`);
  }
}

type Case = {
  resource: string;
  payload: Record<string, unknown>;
  assertCreated?: (row: Record<string, unknown>) => void;
};

const stamp = Date.now().toString(36);

const CASES: Case[] = [
  {
    resource: "generator-log",
    payload: {
      date: "2026-09-10",
      generator: `WriteVerify Gen ${stamp}`,
      startedAt: "2026-09-10T08:00:00.000Z",
      endedAt: "2026-09-10T10:00:00.000Z",
      fuelUsed: 3.25,
      remarks: "verify-operational-registers-write",
    },
    assertCreated: (row) => {
      const hours = Number(row.hours);
      if (hours !== 2) {
        throw new Error(`generator-log hours expected 2, got ${row.hours}`);
      }
    },
  },
  {
    resource: "energy-reading",
    payload: {
      date: "2026-09-10",
      meter: `M-${stamp}`,
      reading: 250,
      remarks: "verify-operational-registers-write",
    },
  },
  {
    resource: "diesel-usage",
    payload: {
      date: "2026-09-10",
      facilityId: "FAC-0001",
      generatorId: `GEN-${stamp}`,
      openingLevel: 100,
      added: 20,
      closingLevel: 90,
    },
    assertCreated: (row) => {
      const consumption = Number(row.consumption);
      if (consumption !== 30) {
        throw new Error(
          `diesel-usage consumption expected 30, got ${row.consumption}`
        );
      }
    },
  },
  {
    resource: "consumables-update",
    payload: {
      date: "2026-09-10",
      facilityId: "FAC-0001",
      itemName: `Verify Item ${stamp}`,
      opening: 10,
      received: 5,
      issued: 2,
      reorderLevel: 3,
    },
    assertCreated: (row) => {
      const closing = Number(row.closing);
      if (closing !== 13) {
        throw new Error(
          `consumables-update closing expected 13, got ${row.closing}`
        );
      }
    },
  },
  {
    resource: "waste-log",
    payload: {
      date: "2026-09-10",
      facilityId: "FAC-0001",
      wasteType: "General",
      quantity: 1.5,
      unit: "bags",
      disposalMethod: "Incineration",
      remarks: "verify-operational-registers-write",
    },
  },
  {
    resource: "fumigation-log",
    payload: {
      date: "2026-09-10",
      facilityId: "FAC-0001",
      areaTreated: `Area ${stamp}`,
      pestType: "Rodent",
      vendor: "Verify Vendor",
      nextDueDate: "2026-10-10",
      remarks: "verify-operational-registers-write",
    },
  },
  {
    resource: "deep-cleaning-log",
    payload: {
      date: "2026-09-10",
      facilityId: "FAC-0001",
      area: `Zone ${stamp}`,
      vendorTeam: "Verify Team",
      status: "completed",
      remarks: "verify-operational-registers-write",
    },
  },
];

function deployHint(message: string | undefined): string {
  const msg = String(message || "");
  if (/GeneratorLogRepository is not defined/i.test(msg)) {
    return (
      " → Create/paste apps-script/GeneratorLogRepository.gs into the Apps Script " +
      "project (File → New), Save, then Deploy → New version."
    );
  }
  if (/GeneratorLogController is not defined/i.test(msg)) {
    return (
      " → Create/paste GeneratorLogRepository.gs, GeneratorLogService.gs, " +
      "GeneratorLogController.gs from apps-script/, then Deploy → New version."
    );
  }
  if (/DieselUsageService is not defined/i.test(msg)) {
    return (
      " → Create/paste DieselUsageRepository.gs and DieselUsageService.gs " +
      "(Controller alone is not enough), then Deploy → New version."
    );
  }
  if (/is not defined/i.test(msg)) {
    return (
      " → Missing Apps Script file(s). Paste the full triad from " +
      "apps-script/deployment/DEPLOYMENT_PACK.md and cut a new Web App version."
    );
  }
  return "";
}

async function main() {
  const url = loadAppsScriptUrl();
  const failures: string[] = [];

  console.log(`verify-operational-registers-write → ${url.slice(-48)}`);

  for (const testCase of CASES) {
    const create = await postAppsScript(url, {
      resource: testCase.resource,
      action: "create",
      payload: testCase.payload,
    });

    if (!create.success || !create.data || typeof create.data !== "object") {
      const line = `${testCase.resource}: FAIL create — ${create.message || "unknown"}${deployHint(create.message)}`;
      failures.push(line);
      console.log(line);
      continue;
    }

    const row = create.data as Record<string, unknown>;
    const id = String(row.id || "");
    if (!id) {
      const line = `${testCase.resource}: FAIL create — missing id in response`;
      failures.push(line);
      console.log(line);
      continue;
    }

    try {
      testCase.assertCreated?.(row);
    } catch (err) {
      const line = `${testCase.resource}: FAIL calc — ${(err as Error).message}`;
      failures.push(line);
      console.log(line);
      continue;
    }

    const list = await postAppsScript(url, {
      resource: testCase.resource,
      action: "getAll",
      payload: { page: 1, pageSize: 25, search: id },
    });

    const rows = Array.isArray(list.data?.data) ? list.data.data : [];
    const found = rows.some((r) => r && r.id === id);
    if (!list.success || !found) {
      const line = `${testCase.resource}: FAIL list — created ${id} not returned`;
      failures.push(line);
      console.log(line);
      continue;
    }

    console.log(`${testCase.resource}: PASS create ${id} + list`);
  }

  if (failures.length) {
    console.error("\nFAIL verify-operational-registers-write");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      "\nNote: Frontend does not reference Apps Script controller names. " +
        "Messages like GeneratorLogController is not defined come from live Apps Script."
    );
    process.exit(1);
  }

  console.log("\nPASS verify-operational-registers-write (all 7 registers)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
