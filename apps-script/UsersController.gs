/**
 * UsersController.gs
 *
 * Entry for module/resource === "users".
 *
 * Expected request body:
 * {
 *   resource: "users",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Always returns jsonResponse_(success, message, data).
 * getAll data MUST be the paginated object from UserService.getAll(payload)
 * — do NOT wrap it again as { data: paginated, page, totalPages }.
 */

var UsersController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Users retrieved.",
            UserService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "User retrieved.",
            UserService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "User created.",
            UserService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "User updated.",
            UserService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "User deactivated.",
            UserService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown users action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Users request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
