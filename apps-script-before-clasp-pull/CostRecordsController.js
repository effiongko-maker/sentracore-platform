  /**
  * CostRecordsController.gs
  *
  * Entry for module/resource === "cost-records".
  */

  var CostRecordsController = (function () {
    function handle(action, payload) {
      try {
        switch (String(action || "getAll")) {
          case "getAll":
            return jsonResponse_(
              true,
              "Cost records retrieved.",
              CostRecordService.getAll(payload)
            );

          case "getById":
            return jsonResponse_(
              true,
              "Cost record retrieved.",
              CostRecordService.getById(payload)
            );

          case "create":
            return jsonResponse_(
              true,
              "Cost record created.",
              CostRecordService.create(payload)
            );

          case "update":
            return jsonResponse_(
              true,
              "Cost record updated.",
              CostRecordService.update(payload)
            );

          default:
            return jsonResponse_(
              false,
              "Unknown cost-records action: " + action,
              null
            );
        }
      } catch (error) {
        return jsonResponse_(
          false,
          error.message || "Cost records request failed.",
          null
        );
      }
    }

    return {
      handle: handle,
    };
  })();
