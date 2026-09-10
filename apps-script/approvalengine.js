/**
 * ==========================================================
 * SENTRACORE APPROVAL ENGINE
 * ==========================================================
 *
 * Purpose:
 * Creates and manages approval requests.
 *
 * This engine:
 *  - Creates approval records
 *  - Approves requests
 *  - Rejects requests
 *
 * It NEVER decides whether approval is needed.
 * That decision belongs to the Decision Engine.
 */

const ApprovalEngine = {

  /**
   * Creates a new approval request.
   */
  createApproval: function (options) {

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getRequiredSheet_(ss, "APPROVALS");

    const approvalId = getNextId_(sheet, "APR", 4);

    sheet.appendRow([
      approvalId,
      options.sourceType,
      options.sourceId,
      options.requestedBy,
      options.approverRole,
      "Pending",
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm:ss"
      ),
      "",
      "",
      ""
    ]);

    return approvalId;

  },

  /**
   * Approves an approval request.
   */
  approve: function (approvalId, approvedBy, comments) {

    updateApprovalStatus_(
      approvalId,
      "Approved",
      approvedBy,
      comments
    );

  },

  /**
   * Rejects an approval request.
   */
  reject: function (approvalId, approvedBy, comments) {

    updateApprovalStatus_(
      approvalId,
      "Rejected",
      approvedBy,
      comments
    );

  }

};


/**
 * ==========================================================
 * PRIVATE HELPERS
 * ==========================================================
 */

function updateApprovalStatus_(
  approvalId,
  status,
  approvedBy,
  comments
) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getRequiredSheet_(ss, "APPROVALS");

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {

    if (String(data[i][0]) === String(approvalId)) {

      sheet.getRange(i + 1, 6).setValue(status); // Status
      sheet.getRange(i + 1, 8).setValue(new Date()); // Approved Date
      sheet.getRange(i + 1, 9).setValue(approvedBy); // Approved By
      sheet.getRange(i + 1, 10).setValue(comments || ""); // Comments

      return;

    }

  }

}