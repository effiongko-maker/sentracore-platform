/**
 * AssetsController.gs
 *
 * Entry for module/resource === "assets".
 * Follows UsersController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "assets",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var AssetsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Assets retrieved.",
            AssetService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Asset retrieved.",
            AssetService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Asset created.",
            AssetService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Asset updated.",
            AssetService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Asset deactivated.",
            AssetService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown assets action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Assets request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
