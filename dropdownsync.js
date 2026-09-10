/**
 * FACILITYOS — DROPDOWN SYNC
 * ---------------------------------------------------------------------
 * Add this as a SIXTH script file in the same Apps Script project.
 *
 * Every form so far has Facility ID / Asset ID / "(User ID)" fields as
 * free text, which is exactly the kind of thing that produces bad data
 * (typos, stale IDs) at scale. This syncs those fields' choices from
 * the master sheets whenever you run it, using the FORM REGISTRY sheet
 * to know which forms exist and where.
 *
 * Setup required: fill in the FORM REGISTRY sheet — one row per form,
 * with the form's editor URL (Google Forms doesn't let Apps Script
 * discover forms on its own; you have to point it at each one). Forms
 * you haven't created yet, or don't want auto-synced, just leave blank
 * or delete the row.
 * ---------------------------------------------------------------------
 */

// =========================================================================
// 1. CONFIG — which question titles get synced from which master data
// =========================================================================

const DROPDOWN_SYNC_TARGETS = [
  { questionTitle: "Facility ID", sourceSheet: "FACILITIES", sourceColumn: "Facility ID" },
  { questionTitle: "Facility Assigned", sourceSheet: "FACILITIES", sourceColumn: "Facility ID" },
  { questionTitle: "Asset ID", sourceSheet: "ASSETS", sourceColumn: "Asset ID" },
  { questionTitle: "Client ID", sourceSheet: "CLIENTS", sourceColumn: "Client ID" },
  { questionTitle: "OEM ID", sourceSheet: "OEM REGISTER", sourceColumn: "OEM ID" }
  // Any question title ending in "(User ID)" is handled separately below,
  // since that suffix appears on ~10 different questions across forms
  // (Requester, Reviewer, Reported By, Owner, Staff Name, etc.) rather
  // than needing one config line each.
];
const USER_ID_SUFFIX = "(User ID)";

// =========================================================================
// 2. ENTRY POINT
// =========================================================================

function syncAllFormDropdowns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const registrySheet = ss.getSheetByName("FORM REGISTRY");
  if (!registrySheet) {
    ui.alert("No FORM REGISTRY sheet found.");
    return;
  }

  const registryRows = sheetToObjects_(registrySheet);
  const choiceSources = buildChoiceSources_(ss);

  let syncedForms = 0;
  let syncedFields = 0;
  const problems = [];

  registryRows.forEach(function (row) {
    const title = row["Form Title"];
    const url = row["Form URL"];
    if (!url || url.indexOf("http") !== 0) return; // skip blank/placeholder rows

    let form;
    try {
      form = FormApp.openByUrl(url);
    } catch (err) {
      problems.push(title + ": couldn't open form at that URL (" + err.message + ")");
      return;
    }

    const fieldsUpdated = syncFormItems_(form, choiceSources);
    syncedFields += fieldsUpdated;
    if (fieldsUpdated > 0) syncedForms++;

    markSynced_(registrySheet, title);
  });

  let summary = "Synced " + syncedFields + " dropdown field(s) across " + syncedForms + " form(s).";
  if (problems.length > 0) summary += "\n\nIssues:\n" + problems.join("\n");
  ui.alert(summary);
}

// =========================================================================
// 3. CHOICE-BUILDING — pure function, unit-testable
// =========================================================================

/** Sorted unique non-empty values from a column of row-objects. */
function buildDropdownChoices_(rows, columnHeader) {
  const values = rows
    .map(function (r) { return r[columnHeader]; })
    .filter(function (v) { return v !== undefined && v !== null && String(v).trim() !== ""; })
    .map(function (v) { return String(v); });
  const unique = Array.from(new Set(values));
  unique.sort();
  return unique;
}

// =========================================================================
// 4. SHEET-DEPENDENT HELPERS
// =========================================================================

/** Reads every DROPDOWN_SYNC_TARGETS source sheet once, plus USERS for the (User ID) suffix rule. */
function buildChoiceSources_(ss) {
  const sources = {};
  DROPDOWN_SYNC_TARGETS.forEach(function (target) {
    const sheet = ss.getSheetByName(target.sourceSheet);
    if (!sheet) return;
    sources[target.questionTitle] = buildDropdownChoices_(sheetToObjects_(sheet), target.sourceColumn);
  });

  const usersSheet = ss.getSheetByName("USERS");
  sources[USER_ID_SUFFIX] = usersSheet ? buildDropdownChoices_(sheetToObjects_(usersSheet), "User ID") : [];

  return sources;
}

/**
 * Walks every item on the form; for any item whose title matches a
 * config target (or ends with the User ID suffix) and is a list-type
 * item (dropdown or multiple choice), replaces its choices. Text items
 * are left alone — this only touches items you've deliberately built
 * as dropdowns/multiple-choice, so switching a question to a dropdown
 * in the Form editor is what opts it into being synced.
 */
function syncFormItems_(form, choiceSources) {
  let updated = 0;
  form.getItems().forEach(function (item) {
    const title = item.getTitle();
    let choices = choiceSources[title];
    if (!choices && title.indexOf(USER_ID_SUFFIX) !== -1) choices = choiceSources[USER_ID_SUFFIX];
    if (!choices || choices.length === 0) return;

    const type = item.getType();
    if (type === FormApp.ItemType.LIST) {
      item.asListItem().setChoiceValues(choices);
      updated++;
    } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
      item.asMultipleChoiceItem().setChoiceValues(choices);
      updated++;
    }
    // Short-answer items with these titles are intentionally left as
    // free text — only dropdown/multiple-choice items get synced.
  });
  return updated;
}

function markSynced_(registrySheet, formTitle) {
  const rows = sheetToObjects_(registrySheet);
  const rowIndex = rows.findIndex(function (r) { return r["Form Title"] === formTitle; });
  if (rowIndex === -1) return;
  const col = findColumn_(registrySheet, "Last Synced");
  registrySheet.getRange(rowIndex + 2, col).setValue(new Date());
}