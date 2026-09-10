/**
 * ==========================================================
 * SENTRACORE WORK ORDER ENGINE
 * ==========================================================
 *
 * Creates Work Orders from approved maintenance requests.
 */

function createWorkOrder_(fields, eventId, maintenanceId) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = getRequiredSheet_(ss, "WORK ORDERS");

  const workOrderId = getNextId_(sheet, "WO", 4);

  // Ask the Decision Engine what to do
  const decision = DecisionEngine.evaluateMaintenance({
    Priority: fields.priority,
    Description: fields.description
  });

  sheet.appendRow([

    workOrderId,                     // Work Order ID

    eventId,                         // Event ID

    maintenanceId,                   // Maintenance ID

    fields.facilityId,               // Facility ID

    fields.assetId || "",            // Asset ID

    fields.description,              // Description

    fields.priority || "Medium",     // Priority

    decision.assignRole,             // Assigned To

    "",                              // Completed By

    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    ),                               // Date Opened

    "",                              // Date Completed

    "",                              // Date Closed

    "Open"                           // Status

  ]);

}