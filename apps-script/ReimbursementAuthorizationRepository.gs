/**
 * ReimbursementAuthorizationRepository.gs
 *
 * Sheet: REIMBURSEMENT_AUTHORIZATIONS
 * Authorization of CostSubmission claims — not Work Order Approvals.
 * Never written onto CostRecord or CostSubmission status.
 *
 * ID format: AUTH-{YYYY}-{NNNNNN}
 */

var ReimbursementAuthorizationRepository = (function () {
  var SHEET_NAME = "REIMBURSEMENT_AUTHORIZATIONS";
  var HEADERS = [
    "Authorization ID",
    "Submission ID",
    "Authorized Amount",
    "Currency",
    "Authorized At",
    "Authorized By",
    "Authority Reference",
    "Notes",
    "Recorded At",
  ];

  function readAmount_(raw) {
    if (raw === "" || raw == null) return undefined;
    var amount = Number(raw);
    return isFinite(amount) ? amount : undefined;
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      return sheet;
    }
    ensureHeaders_(sheet);
    return sheet;
  }

  function ensureHeaders_(sheet) {
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var lastCol = Math.max(1, sheet.getLastColumn());
    var added = 0;
    for (var i = 0; i < HEADERS.length; i++) {
      var name = HEADERS[i];
      if (!SheetFieldUtils.hasHeader(headerMap, name)) {
        sheet.getRange(1, lastCol + 1 + added).setValue(name);
        added++;
      }
    }
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function rowToCanonical_(sheetRow) {
    return {
      authorizationId: SheetFieldUtils.cellText(sheetRow["Authorization ID"]),
      submissionId: SheetFieldUtils.cellText(sheetRow["Submission ID"]),
      authorizedAmount: readAmount_(sheetRow["Authorized Amount"]),
      currency: SheetFieldUtils.cellText(sheetRow["Currency"]) || "NGN",
      authorizedAt: SheetFieldUtils.cellText(sheetRow["Authorized At"]),
      authorizedBy: SheetFieldUtils.cellText(sheetRow["Authorized By"]),
      authorityReference:
        SheetFieldUtils.cellText(sheetRow["Authority Reference"]) || undefined,
      notes: SheetFieldUtils.cellText(sheetRow["Notes"]) || undefined,
      recordedAt: SheetFieldUtils.cellText(sheetRow["Recorded At"]),
    };
  }

  function canonicalToFields_(canonical) {
    return {
      "Authorization ID": canonical.authorizationId || "",
      "Submission ID": canonical.submissionId || "",
      "Authorized Amount":
        canonical.authorizedAmount != null ? canonical.authorizedAmount : "",
      Currency: canonical.currency || "NGN",
      "Authorized At": canonical.authorizedAt || "",
      "Authorized By": canonical.authorizedBy || "",
      "Authority Reference": canonical.authorityReference || "",
      Notes: canonical.notes || "",
      "Recorded At": canonical.recordedAt || "",
    };
  }

  function writeRow_(sheet, rowIndex, canonical) {
    var headerMap = ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFieldsStrict(
      headerMap,
      lastCol,
      fields
    );
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
  }

  function findRowIndex_(authorizationId) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Authorization ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol] || "").trim() === String(authorizationId)) {
        return r + 1;
      }
    }
    return -1;
  }

  function findBySubmissionId_(submissionId) {
    var id = String(submissionId || "").trim();
    if (!id) return null;
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;
    var headers = values[0];
    var matches = [];
    for (var r = 1; r < values.length; r++) {
      var obj = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      if (SheetFieldUtils.cellText(obj["Submission ID"]) === id) {
        matches.push(rowToCanonical_(obj));
      }
    }
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return String(b.authorizedAt || b.recordedAt || "").localeCompare(
        String(a.authorizedAt || a.recordedAt || "")
      );
    });
    return matches[0];
  }

  function nextId_() {
    var year = new Date().getFullYear();
    var all = getAll({ page: 1, pageSize: 10000 });
    var rows = all.data || [];
    var maxYear = 0;
    var prefix = "AUTH-" + year + "-";
    for (var i = 0; i < rows.length; i++) {
      var id = String(rows[i].authorizationId || "");
      if (id.indexOf(prefix) === 0) {
        var seq = Number(id.slice(prefix.length));
        if (isFinite(seq) && seq > maxYear) maxYear = seq;
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return prefix + padded;
  }

  function getAll(payload) {
    payload = payload || {};
    var page = Math.max(1, Number(payload.page) || 1);
    var pageSize = Math.max(1, Math.min(100, Number(payload.pageSize) || 25));
    var submissionId = payload.submissionId
      ? String(payload.submissionId).trim()
      : "";
    var search = payload.search
      ? String(payload.search).trim().toLowerCase()
      : "";

    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var rows = [];
    if (values.length > 1) {
      var headers = values[0];
      for (var r = 1; r < values.length; r++) {
        var obj = SheetFieldUtils.rowToSheetObject(headers, values[r]);
        var authorizationId = SheetFieldUtils.cellText(obj["Authorization ID"]);
        if (!authorizationId) continue;
        rows.push(rowToCanonical_(obj));
      }
    }

    rows.sort(function (a, b) {
      return String(b.authorizedAt || "").localeCompare(
        String(a.authorizedAt || "")
      );
    });

    if (submissionId) {
      rows = rows.filter(function (row) {
        return String(row.submissionId || "") === submissionId;
      });
    }
    if (search) {
      rows = rows.filter(function (row) {
        return (
          String(row.authorizationId || "")
            .toLowerCase()
            .indexOf(search) >= 0 ||
          String(row.submissionId || "")
            .toLowerCase()
            .indexOf(search) >= 0
        );
      });
    }

    var total = rows.length;
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);
    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
    };
  }

  function getById(authorizationId) {
    var id = String(authorizationId || "").trim();
    if (!id) throw new Error("authorizationId is required");
    var rowIndex = findRowIndex_(id);
    if (rowIndex < 0) throw new Error("Authorization not found: " + id);
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    return rowToCanonical_(
      SheetFieldUtils.rowToSheetObject(headers, values[rowIndex - 1])
    );
  }

  function getBySubmissionId(submissionId) {
    return findBySubmissionId_(submissionId);
  }

  function mergeCanonical_(current, payload) {
    payload = payload || {};
    return {
      authorizationId: current.authorizationId,
      submissionId:
        payload.submissionId != null
          ? String(payload.submissionId).trim()
          : current.submissionId,
      authorizedAmount:
        payload.authorizedAmount !== undefined
          ? readAmount_(payload.authorizedAmount)
          : current.authorizedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      authorizedAt:
        payload.authorizedAt != null
          ? payload.authorizedAt
          : current.authorizedAt,
      authorizedBy:
        payload.authorizedBy != null
          ? payload.authorizedBy
          : current.authorizedBy,
      authorityReference:
        payload.authorityReference !== undefined
          ? payload.authorityReference || undefined
          : current.authorityReference,
      notes:
        payload.notes !== undefined ? payload.notes || undefined : current.notes,
      recordedAt: current.recordedAt,
    };
  }

  function create(payload) {
    payload = payload || {};
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var authorizationId = nextId_();
    var canonical = {
      authorizationId: authorizationId,
      submissionId: String(payload.submissionId || "").trim(),
      authorizedAmount: readAmount_(payload.authorizedAmount),
      currency: payload.currency || "NGN",
      authorizedAt: payload.authorizedAt || now,
      authorizedBy: payload.authorizedBy || "",
      authorityReference: payload.authorityReference || undefined,
      notes: payload.notes || undefined,
      recordedAt: payload.recordedAt || now,
    };
    var rowIndex = sheet.getLastRow() + 1;
    writeRow_(sheet, rowIndex, canonical);
    return canonical;
  }

  function update(authorizationId, payload) {
    var rowIndex = findRowIndex_(authorizationId);
    if (rowIndex === -1) return null;
    var current = getById(authorizationId);
    if (!current) return null;
    var merged = mergeCanonical_(current, payload || {});
    var sheet = getSheet_();
    writeRow_(sheet, rowIndex, merged);
    return merged;
  }

  return {
    getAll: getAll,
    getById: getById,
    getBySubmissionId: getBySubmissionId,
    create: create,
    update: update,
  };
})();
