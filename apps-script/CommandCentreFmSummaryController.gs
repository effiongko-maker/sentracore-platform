/** Additive Command Centre FM aggregate endpoint. */
var CommandCentreFmSummaryController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getOperationalPicture")) {
        case "getOperationalPicture":
          return jsonResponse_(
            true,
            "Operational Picture summary retrieved.",
            CommandCentreFmSummaryService.getOperationalPicture(payload)
          );
        case "getAssignmentSummary":
          return jsonResponse_(
            true,
            "Assignment summary retrieved.",
            CommandCentreFmSummaryService.getAssignmentSummary(payload)
          );
        default:
          return jsonResponse_(
            false,
            "Unknown command-centre-fm action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Command Centre FM summary request failed.",
        null
      );
    }
  }
  return { handle: handle };
})();
