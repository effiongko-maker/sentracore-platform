#!/usr/bin/env node
/**
 * Cross-service schema contract: facilities/getAll ↔ master-data/getLocationCatalog
 *
 * Catches Facility ID / Facility Name alias mismatches in location catalog projection.
 *
 * Usage:
 *   node scripts/smoke-location-catalog-contract.cjs
 *   APPS_SCRIPT_URL=... node scripts/smoke-location-catalog-contract.cjs
 */

const url =
  process.env.APPS_SCRIPT_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://script.google.com/macros/s/AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm/exec";

async function post(resource, action, payload = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ resource, action, payload }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!json.success) {
    throw new Error(
      `${resource}/${action} failed: ${json.message || res.status}`
    );
  }
  return json.data;
}

function facilityIdFromRow(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.id || row["Facility ID"] || "").trim();
}

function facilityNameFromRow(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.name || row["Facility Name"] || "").trim();
}

async function main() {
  const facilitiesPage = await post("facilities", "getAll", {
    page: 1,
    pageSize: 200,
  });
  const facilityRows = Array.isArray(facilitiesPage)
    ? facilitiesPage
    : facilitiesPage?.data || [];
  const facilityTotal = Number(
    Array.isArray(facilitiesPage)
      ? facilitiesPage.length
      : facilitiesPage?.total ?? facilityRows.length
  );

  const catalog = await post("master-data", "getLocationCatalog", {
    _auditTiming: true,
  });

  const catalogFacilities = Array.isArray(catalog?.facilities)
    ? catalog.facilities
    : [];

  console.log(
    JSON.stringify(
      {
        facilitiesTotal: facilityTotal,
        catalogFacilities: catalogFacilities.length,
        sampleFacility: facilityRows[0]
          ? {
              id: facilityIdFromRow(facilityRows[0]),
              name: facilityNameFromRow(facilityRows[0]),
            }
          : null,
        catalogSample: catalogFacilities[0] || null,
        timings: catalog?._serverTimings || null,
      },
      null,
      2
    )
  );

  if (facilityTotal > 0 && catalogFacilities.length === 0) {
    throw new Error(
      "CONTRACT FAIL: facilities/getAll has rows but getLocationCatalog.facilities is empty (alias mismatch likely)."
    );
  }

  const expected = facilityRows
    .map((row) => ({
      id: facilityIdFromRow(row),
      name: facilityNameFromRow(row),
    }))
    .filter((row) => row.id);

  for (const src of expected) {
    const match = catalogFacilities.find((item) => item.id === src.id);
    if (!match) {
      throw new Error(
        `CONTRACT FAIL: catalog missing facility ${src.id} (${src.name}).`
      );
    }
  }

  const ncc = catalogFacilities.find((item) => item.id === "FAC-0001");
  if (!ncc) {
    throw new Error("CONTRACT FAIL: FAC-0001 missing from catalog.facilities.");
  }
  if (String(ncc.name).trim() !== "NCC Annex") {
    throw new Error(
      `CONTRACT FAIL: FAC-0001 name expected "NCC Annex", got ${JSON.stringify(ncc.name)}.`
    );
  }

  console.log("LOCATION_CATALOG_CONTRACT_OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
