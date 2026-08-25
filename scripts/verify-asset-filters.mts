/**
 * Verifies Assets list pipeline:
 * sort → search → category/facility/status filters → paginate → totals
 *
 * Run: npx tsx scripts/verify-asset-filters.mts
 */
import type { Asset } from "../src/modules/assets/types";
import { queryAssetsPage } from "../src/services/assets/queryAssets";

function asset(partial: Partial<Asset> & Pick<Asset, "id" | "name">): Asset {
  return {
    category: "other",
    facility: "FAC-1",
    manufacturer: "Acme",
    model: "X1",
    serialNumber: `SN-${partial.id}`,
    installDate: "",
    warrantyExpiry: "",
    oemId: "",
    condition: "good",
    status: "active",
    assignedTo: "",
    criticality: "unassessed",
    ...partial,
  };
}

const facilities = new Map<string, string>([
  ["FAC-1", "Lagos HQ"],
  ["FAC-2", "Accra Hub"],
  ["FAC-3", "Docklands Campus"],
]);

const dataset: Asset[] = [
  asset({
    id: "AST-01",
    name: "Chiller Unit #02",
    category: "hvac",
    facility: "FAC-1",
    status: "active",
  }),
  asset({
    id: "AST-02",
    name: "UPS Bank A",
    category: "power",
    facility: "Lagos HQ", // stored as name
    status: "active",
  }),
  asset({
    id: "AST-03",
    name: "Passenger Lift 1",
    category: "vertical_transport",
    facility: "FAC-2",
    status: "pending",
  }),
  asset({
    id: "AST-04",
    name: "Standby Generator",
    category: "power",
    facility: "FAC-2",
    status: "inactive",
  }),
  asset({
    id: "AST-05",
    name: "Core Switch",
    category: "it",
    facility: "FAC-3",
    status: "inactive",
  }),
  asset({
    id: "AST-06",
    name: "Fire Panel",
    category: "fire_safety",
    facility: "FAC-1",
    status: "pending",
  }),
  asset({
    id: "AST-07",
    name: "AHU East",
    category: "hvac",
    facility: "FAC-3",
    status: "active",
  }),
  asset({
    id: "AST-08",
    name: "Pump P-12",
    category: "mechanical",
    facility: "FAC-1",
    status: "active",
  }),
  asset({
    id: "AST-09",
    name: "Transformer T1",
    category: "electrical",
    facility: "FAC-2",
    status: "active",
  }),
  asset({
    id: "AST-10",
    name: "Old Chiller",
    category: "hvac",
    facility: "FAC-1",
    status: "inactive",
  }),
];

type Case = {
  name: string;
  params: Parameters<typeof queryAssetsPage>[1];
  expectIds?: string[];
  expectTotal?: number;
  expectPage?: number;
  expectTotalPages?: number;
  expectFirstId?: string;
};

const cases: Case[] = [
  {
    name: "unfiltered newest-first",
    params: { page: 1, pageSize: 8 },
    expectFirstId: "AST-10",
    expectTotal: 10,
    expectTotalPages: 2,
  },
  {
    name: "status active",
    params: { page: 1, pageSize: 20, status: "active" },
    expectIds: ["AST-09", "AST-08", "AST-07", "AST-02", "AST-01"],
  },
  {
    name: "status inactive",
    params: { page: 1, pageSize: 20, status: "inactive" },
    expectIds: ["AST-10", "AST-05", "AST-04"],
  },
  {
    name: "status pending",
    params: { page: 1, pageSize: 20, status: "pending" },
    expectIds: ["AST-06", "AST-03"],
  },
  {
    name: "category hvac",
    params: { page: 1, pageSize: 20, category: "hvac" },
    expectIds: ["AST-10", "AST-07", "AST-01"],
  },
  {
    name: "facility by id FAC-1 (includes name-stored Lagos HQ)",
    params: { page: 1, pageSize: 20, facility: "FAC-1" },
    expectIds: ["AST-10", "AST-08", "AST-06", "AST-02", "AST-01"],
  },
  {
    name: "facility FAC-2",
    params: { page: 1, pageSize: 20, facility: "FAC-2" },
    expectIds: ["AST-09", "AST-04", "AST-03"],
  },
  {
    name: "category power + status active",
    params: {
      page: 1,
      pageSize: 20,
      category: "power",
      status: "active",
    },
    expectIds: ["AST-02"],
  },
  {
    name: "category hvac + facility FAC-1",
    params: {
      page: 1,
      pageSize: 20,
      category: "hvac",
      facility: "FAC-1",
    },
    expectIds: ["AST-10", "AST-01"],
  },
  {
    name: "facility FAC-1 + status inactive",
    params: {
      page: 1,
      pageSize: 20,
      facility: "FAC-1",
      status: "inactive",
    },
    expectIds: ["AST-10"],
  },
  {
    name: "category hvac + facility FAC-1 + status active",
    params: {
      page: 1,
      pageSize: 20,
      category: "hvac",
      facility: "FAC-1",
      status: "active",
    },
    expectIds: ["AST-01"],
  },
  {
    name: "category power + facility FAC-2 + status inactive",
    params: {
      page: 1,
      pageSize: 20,
      category: "power",
      facility: "FAC-2",
      status: "inactive",
    },
    expectIds: ["AST-04"],
  },
  {
    name: "triple filter empty",
    params: {
      page: 1,
      pageSize: 20,
      category: "it",
      facility: "FAC-1",
      status: "active",
    },
    expectIds: [],
    expectTotal: 0,
  },
  {
    name: "search name with status active",
    params: {
      page: 1,
      pageSize: 20,
      search: "chiller",
      status: "active",
    },
    expectIds: ["AST-01"],
  },
  {
    name: "search keeps filters (inactive chiller)",
    params: {
      page: 1,
      pageSize: 20,
      search: "chiller",
      status: "inactive",
    },
    expectIds: ["AST-10"],
  },
  {
    name: "search by asset id",
    params: { page: 1, pageSize: 20, search: "AST-05" },
    expectIds: ["AST-05"],
  },
  {
    name: "search by facility name with category it",
    params: {
      page: 1,
      pageSize: 20,
      search: "docklands",
      category: "it",
    },
    expectIds: ["AST-05"],
  },
  {
    name: "pagination page 2 of unfiltered",
    params: { page: 2, pageSize: 8 },
    expectIds: ["AST-02", "AST-01"],
    expectTotal: 10,
    expectPage: 2,
    expectTotalPages: 2,
  },
  {
    name: "pagination adjusts when filters shrink set",
    params: {
      page: 9,
      pageSize: 8,
      status: "pending",
    },
    expectIds: ["AST-06", "AST-03"],
    expectPage: 1,
    expectTotalPages: 1,
    expectTotal: 2,
  },
  {
    name: "clear filters equivalent (all)",
    params: {
      page: 1,
      pageSize: 20,
      category: "all",
      facility: "all",
      status: "all",
    },
    expectTotal: 10,
  },
  {
    name: "sort oldest",
    params: { page: 1, pageSize: 3, sort: "oldest" },
    expectIds: ["AST-01", "AST-02", "AST-03"],
    expectFirstId: "AST-01",
  },
  {
    name: "sort name A–Z",
    params: { page: 1, pageSize: 3, sort: "name_asc" },
    expectIds: ["AST-07", "AST-01", "AST-05"],
  },
  {
    name: "sort name Z–A",
    params: { page: 1, pageSize: 3, sort: "name_desc" },
    expectIds: ["AST-02", "AST-09", "AST-04"],
  },
  {
    name: "sort name A–Z with status active",
    params: {
      page: 1,
      pageSize: 20,
      status: "active",
      sort: "name_asc",
    },
    expectIds: ["AST-07", "AST-01", "AST-08", "AST-09", "AST-02"],
  },
  {
    name: "sort newest with category hvac",
    params: {
      page: 1,
      pageSize: 20,
      category: "hvac",
      sort: "newest",
    },
    expectIds: ["AST-10", "AST-07", "AST-01"],
  },
  {
    name: "search + sort oldest",
    params: {
      page: 1,
      pageSize: 20,
      search: "chiller",
      sort: "oldest",
    },
    expectIds: ["AST-01", "AST-10"],
  },
];

let failed = 0;

for (const testCase of cases) {
  const result = queryAssetsPage(dataset, testCase.params, facilities);
  const ids = result.data.map((item) => item.id);
  const problems: string[] = [];

  if (testCase.expectIds) {
    if (ids.join(",") !== testCase.expectIds.join(",")) {
      problems.push(
        `ids expected [${testCase.expectIds.join(", ")}] got [${ids.join(", ")}]`
      );
    }
  }
  if (testCase.expectTotal != null && result.total !== testCase.expectTotal) {
    problems.push(`total expected ${testCase.expectTotal} got ${result.total}`);
  }
  if (testCase.expectPage != null && result.page !== testCase.expectPage) {
    problems.push(`page expected ${testCase.expectPage} got ${result.page}`);
  }
  if (
    testCase.expectTotalPages != null &&
    result.totalPages !== testCase.expectTotalPages
  ) {
    problems.push(
      `totalPages expected ${testCase.expectTotalPages} got ${result.totalPages}`
    );
  }
  if (testCase.expectFirstId && ids[0] !== testCase.expectFirstId) {
    problems.push(
      `first id expected ${testCase.expectFirstId} got ${ids[0] ?? "(none)"}`
    );
  }

  if (problems.length) {
    failed += 1;
    console.error(`FAIL  ${testCase.name}`);
    for (const problem of problems) console.error(`  - ${problem}`);
  } else {
    console.log(`PASS  ${testCase.name} (total=${result.total})`);
  }
}

// Exhaustive Category × Facility × Status for filterable statuses
const categories = ["all", "hvac", "power", "it"] as const;
const facilityIds = ["all", "FAC-1", "FAC-2", "FAC-3"] as const;
const statuses = ["all", "active", "inactive", "pending"] as const;
let comboPass = 0;
let comboFail = 0;

for (const category of categories) {
  for (const facility of facilityIds) {
    for (const status of statuses) {
      const result = queryAssetsPage(
        dataset,
        { page: 1, pageSize: 50, category, facility, status },
        facilities
      );
      const manual = dataset.filter((row) => {
        const catOk =
          category === "all" ||
          row.category.toLowerCase() === category.toLowerCase();
        const statusOk =
          status === "all" ||
          row.status.toLowerCase() === status.toLowerCase();
        let facilityOk = true;
        if (facility !== "all") {
          const name = facilities.get(facility);
          facilityOk =
            row.facility === facility ||
            (name != null && row.facility === name);
        }
        return catOk && statusOk && facilityOk;
      });
      const expectedIds = [...manual]
        .sort((a, b) => {
          const seq = (id: string) => {
            const m = id.match(/AST-(\d+)/i);
            return m ? parseInt(m[1], 10) : 0;
          };
          return seq(b.id) - seq(a.id);
        })
        .map((row) => row.id);
      const gotIds = result.data.map((row) => row.id);
      if (
        result.total !== manual.length ||
        gotIds.join(",") !== expectedIds.join(",")
      ) {
        comboFail += 1;
        console.error(
          `FAIL  combo cat=${category} fac=${facility} status=${status}`
        );
        console.error(
          `  expected ${manual.length} [${expectedIds.join(", ")}] got ${result.total} [${gotIds.join(", ")}]`
        );
      } else {
        comboPass += 1;
      }
    }
  }
}

console.log(`\nCombo matrix: ${comboPass} passed, ${comboFail} failed`);
if (failed || comboFail) {
  console.error(`\n${failed + comboFail} failing assertion(s)`);
  process.exit(1);
}
console.log("\nAll asset filter scenarios passed.");
