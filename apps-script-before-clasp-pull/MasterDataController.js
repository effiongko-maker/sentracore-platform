/**
 * MasterDataController.gs
 *
 * Entry for module/resource === "master-data".
 *
 * Expected request body:
 * {
 *   resource: "master-data",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate" | "getLocationCatalog",
 *   payload: { entity: "departments"|"buildings"|"floors"|"rooms"|"vendors", ... }
 * }
 */

var MasterDataController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Master data retrieved.",
            MasterDataService.getAll(payload)
          );

        case "getLocationCatalog":
          return jsonResponse_(
            true,
            "Location catalog retrieved.",
            MasterDataService.getLocationCatalog(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Master data item retrieved.",
            MasterDataService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Master data item created.",
            MasterDataService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Master data item updated.",
            MasterDataService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Master data item deactivated.",
            MasterDataService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown master-data action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Master-data request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
