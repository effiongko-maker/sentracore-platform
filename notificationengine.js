/**
 * FACILITYOS — NOTIFICATION ENGINE
 * ---------------------------------------------------------------------
 * Add this as a FIFTH script file in the same Apps Script project.
 * Replaces the log-only notifySubmitterOfError_() stub in
 * FacilityOS_FormProcessor.gs with real email delivery, and adds a
 * critical-incident alert path.
 *
 * IMPORTANT: after adding this file, delete the old stub function
 * (same name) from FacilityOS_FormProcessor.gs — Apps Script allows
 * duplicate function names across files in a project and silently uses
 * whichever loads last, which is fragile. Search FormProcessor.gs for
 * "function notifySubmitterOfError_" and remove that whole function;
 * the version in this file replaces it exactly (same name, same
 * call signature — nothing else needs to change).
 *
 * Every send is wrapped in try/catch — a failed or misconfigured email
 * must never break form processing. Failures fall back to the same
 * _ERROR_LOG tab everything else uses.
 * ---------------------------------------------------------------------
 */

// =========================================================================
// 1. CONFIG
// =========================================================================

// Fields tried, in order, to find "who submitted this" for a rejection
// email. Forms don't all use the same field name (Requester vs Reported
// By vs Reviewer), so this tries the common ones rather than requiring
// every one of the 32 FORM_CONFIGS entries to declare it explicitly.
const SUBMITTER_FIELD_CANDIDATES = ["requester", "reportedBy", "reviewer", "staffId", "assignedTo"];

// =========================================================================
// 2. PURE HELPERS — no Mail/Sheet I/O, unit-testable in isolation
// =========================================================================

function findUserEmail_(userRows, userId) {
  if (!userId) return null;
  const match = userRows.filter(function (u) { return u["User ID"] === userId; })[0];
  return match ? (match["Email"] || null) : null;
}

function resolveSubmitterId_(fields) {
  for (let i = 0; i < SUBMITTER_FIELD_CANDIDATES.length; i++) {
    const key = SUBMITTER_FIELD_CANDIDATES[i];
    if (fields[key]) return fields[key];
  }
  return null;
}

function getConfigValue_(configRows, key) {
  const match = configRows.filter(function (c) { return c["Key"] === key; })[0];
  return match ? match["Value"] : null;
}

function buildErrorNotificationEmail_(formTitle, missingFields) {
  return {
    subject: "FacilityOS: your '" + formTitle + "' submission was not recorded",
    body: "Your recent '" + formTitle + "' submission is missing required information and was not saved:\n\n" +
          missingFields.join(", ") + "\n\nPlease resubmit the form with these fields completed."
  };
}

function buildCriticalIncidentEmail_(fields, eventId) {
  return {
    subject: "🔴 CRITICAL Incident Reported — " + (fields.facilityId || "Unknown Facility"),
    body: "A Critical-severity incident was just logged.\n\n" +
          "Event ID: " + eventId + "\n" +
          "Facility: " + (fields.facilityId || "n/a") + "\n" +
          "Type: " + (fields.incidentType || "n/a") + "\n" +
          "Description: " + (fields.description || "n/a") + "\n" +
          "Reported By: " + (fields.reportedBy || "n/a") + "\n\n" +
          "Per the Compliance Matrix, Critical incidents require review within 24 hours."
  };
}

// =========================================================================
// 3. SEND WRAPPER — the only place that actually calls MailApp
// =========================================================================

function sendNotification_(toEmail, subject, body) {
  if (!toEmail) return false;
  try {
    MailApp.sendEmail(toEmail, subject, body);
    return true;
  } catch (err) {
    logError_("Email send failed to '" + toEmail + "' (" + subject + "): " + err.message);
    return false;
  }
}

// =========================================================================
// 4. ENTRY POINTS — called from FormProcessor.gs
// =========================================================================

/**
 * Replaces the stub of the same name in FormProcessor.gs. Same call
 * signature: (fields, formTitle, missingFields). Looks up the
 * submitter's email via USERS and sends them the rejection reason; if
 * no submitter can be identified or has no email on file, falls back
 * to the error log only (never throws).
 */
function notifySubmitterOfError_(fields, formTitle, missingFields) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersSheet = ss.getSheetByName("USERS");
    const userRows = usersSheet ? sheetToObjects_(usersSheet) : [];

    const submitterId = resolveSubmitterId_(fields);
    const email = findUserEmail_(userRows, submitterId);

    const message = buildErrorNotificationEmail_(formTitle, missingFields);
    const sent = sendNotification_(email, message.subject, message.body);

    if (!sent) {
      logError_(
        "No notification sent for rejected '" + formTitle + "' submission " +
        "(submitter id: " + (submitterId || "unresolved") + ", email: " + (email || "not on file") + ")."
      );
    }
  } catch (err) {
    logError_("notifySubmitterOfError_ crashed: " + err.message);
  }
}

/**
 * Call from onFormSubmit after a successful Incident Report write, when
 * severity is Critical. Sends to CONFIG's ALERT_EMAIL key — set that key
 * in the CONFIG sheet (Key="ALERT_EMAIL", Value=<address>) before this
 * does anything; with no value set it just logs and does nothing further.
 */
function notifyCriticalIncident_(fields, eventId) {
  if (String(fields.severity).toLowerCase() !== "critical") return;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName("CONFIG");
    const configRows = configSheet ? sheetToObjects_(configSheet) : [];
    const alertEmail = getConfigValue_(configRows, "ALERT_EMAIL");

    if (!alertEmail) {
      logError_("Critical incident " + eventId + " logged but no ALERT_EMAIL set in CONFIG — no alert sent.");
      return;
    }
    const message = buildCriticalIncidentEmail_(fields, eventId);
    sendNotification_(alertEmail, message.subject, message.body);
  } catch (err) {
    logError_("notifyCriticalIncident_ crashed: " + err.message);
  }
}