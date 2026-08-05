/**
 * Temporary measurement helper for EntityResolver priming.
 * Run: npx tsx scripts/measure-entity-resolver-prime.ts
 */
import { EntityResolver, EntityKinds } from "../src/services/entityResolver";

async function main() {
  EntityResolver.invalidate();
  EntityResolver.resetNetworkDirectoryLoadCount();

  EntityResolver.primeFromReportingSnapshot({
    users: [{ id: "USR-0001", name: "Ada Okonkwo" }],
    facilities: [
      { id: "FAC-0001", name: "LBP Tower A" },
      { "Facility ID": "FAC-0002", "Facility Name": "Plant West" },
    ],
    assets: [{ id: "AST-0001", name: "Chiller" }],
    workOrders: [{ id: "WO-0001", title: "Fix door" }],
    maintenance: [{ id: "MNT-0001", title: "Noise check" }],
  });

  const before = EntityResolver.getNetworkDirectoryLoadCount();
  const facility = await EntityResolver.resolveFacility("FAC-0001");
  const facilityAlt = await EntityResolver.resolveFacility("FAC-0002");
  const user = await EntityResolver.resolveUser("USR-0001");
  const cached = EntityResolver.getCached(EntityKinds.facility, "FAC-0001");
  const after = EntityResolver.getNetworkDirectoryLoadCount();

  console.log(
    JSON.stringify(
      {
        facility,
        facilityAlt,
        user,
        cached,
        networkLoadsBeforeResolve: before,
        networkLoadsAfterResolve: after,
        entityResolverRequests: after - before,
      },
      null,
      2
    )
  );

  if (after !== before) {
    console.error("FAIL: EntityResolver performed network loads after priming");
    process.exit(1);
  }
  if (facility !== "LBP Tower A" || facilityAlt !== "Plant West") {
    console.error("FAIL: unexpected facility labels");
    process.exit(1);
  }
  console.log("PASS: primed EntityResolver made 0 network directory loads");
}

main();
