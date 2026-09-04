/**
 * ReimbursementPaymentRepository.gs
 *
 * Sheet: REIMBURSEMENT_PAYMENTS
 * Receipts against CostSubmission — never written onto CostRecord or CostSubmission.
 *
 * ID format: PAY-{YYYY}-{NNNNNN}
 */

var ReimbursementPaymentRepository = (function () {
  var SHEET_NAME = "REIMBURSEMENT_PAYMENTS";
  var HEADERS = [
    "Payment ID",
    "Submission ID",
    "Received Amount",
    "Currency",
    "Received At",
    "Reference",
    "Method",
    "Evidence Reference",
    "Notes",
    "Recorded At",
    "Recorded By",
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
      paymentId: SheetFieldUtils.cellText(sheetRow["Payment ID"]),
      submissionId: SheetFieldUtils.cellText(sheetRow["Submission ID"]),
      receivedAmount: readAmount_(sheetRow["Received Amount"]),
      currency: SheetFieldUtils.cellText(sheetRow["Currency"]) || "NGN",
      receivedAt: SheetFieldUtils.cellText(sheetRow["Received At"]),
      reference: SheetFieldUtils.cellText(sheetRow["Reference"]) || undefined,
      method: SheetFieldUtils.cellText(sheetRow["Method"]) || undefined,
      evidenceReference:
        SheetFieldUtils.cellText(sheetRow["Evidence Reference"]) || undefined,
      notes: SheetFieldUtils.cellText(sheetRow["Notes"]) || undefined,
      recordedAt: SheetFieldUtils.cellText(sheetRow["Recorded At"]),
      recordedBy: SheetFieldUtils.cellText(sheetRow["Recorded By"]),
    };
  }

  function canonicalToFields_(canonical) {
    return {
      "Payment ID": canonical.paymentId || "",
      "Submission ID": canonical.submissionId || "",
      "Received Amount":
        canonical.receivedAmount != null ? canonical.receivedAmount : "",
      Currency: canonical.currency || "NGN",
      "Received At": canonical.receivedAt || "",
      Reference: canonical.reference || "",
      Method: canonical.method || "",
      "Evidence Reference": canonical.evidenceReference || "",
      Notes: canonical.notes || "",
      "Recorded At": canonical.recordedAt || "",
      "Recorded By": canonical.recordedBy || "",
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

  function findRowIndex_(paymentId) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Payment ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol] || "").trim() === String(paymentId)) {
        return r + 1;
      }
    }
    return -1;
  }

  /**
   * Next PAY-{year}-{NNNNNN} from persisted sheet Payment ID values.
   * Must not use paginated getAll() — that wrapper is not an array.
   */
  function nextId_() {
    var year = new Date().getFullYear();
    var prefix = "PAY-" + year + "-";
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var maxSeq = 0;
    if (values.length <= 1) {
      return prefix + "000001";
    }
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Payment ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return prefix + "000001";
    for (var r = 1; r < values.length; r++) {
      var id = String(values[r][idCol] || "").trim();
      if (id.indexOf(prefix) === 0) {
        var seq = Number(id.slice(prefix.length));
        if (isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    var next = maxSeq + 1;
    var padded = ("000000" + next).slice(-6);
    return prefix + padded;
  }

  /**
   * All receipts for a submission — unpaginated sheet scan.
   * Used by the authorized-amount ceiling so pageSize=100 cannot undercount.
   */
  function listAllBySubmissionId(submissionId) {
    var id = String(submissionId || "").trim();
    var rows = [];
    if (!id) return rows;
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return rows;
    var headers = values[0];
    for (var r = 1; r < values.length; r++) {
      var obj = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var paymentId = SheetFieldUtils.cellText(obj["Payment ID"]);
      if (!paymentId) continue;
      var canonical = rowToCanonical_(obj);
      if (String(canonical.submissionId || "") === id) {
        rows.push(canonical);
      }
    }
    return rows;
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
        var paymentId = SheetFieldUtils.cellText(obj["Payment ID"]);
        if (!paymentId) continue;
        rows.push(rowToCanonical_(obj));
      }
    }

    rows.sort(function (a, b) {
      return String(b.receivedAt || "").localeCompare(
        String(a.receivedAt || "")
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
          String(row.paymentId || "")
            .toLowerCase()
            .indexOf(search) >= 0 ||
          String(row.reference || "")
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

  function getById(paymentId) {
    var id = String(paymentId || "").trim();
    if (!id) throw new Error("paymentId is required");
    var rowIndex = findRowIndex_(id);
    if (rowIndex < 0) throw new Error("Payment not found: " + id);
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    return rowToCanonical_(
      SheetFieldUtils.rowToSheetObject(headers, values[rowIndex - 1])
    );
  }

  function mergeCanonical_(current, payload) {
    payload = payload || {};
    return {
      paymentId: current.paymentId,
      submissionId:
        payload.submissionId != null
          ? String(payload.submissionId).trim()
          : current.submissionId,
      receivedAmount:
        payload.receivedAmount !== undefined
          ? readAmount_(payload.receivedAmount)
          : current.receivedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      receivedAt:
        payload.receivedAt != null ? payload.receivedAt : current.receivedAt,
      reference:
        payload.reference !== undefined
          ? payload.reference || undefined
          : current.reference,
      method:
        payload.method !== undefined
          ? payload.method || undefined
          : current.method,
      evidenceReference:
        payload.evidenceReference !== undefined
          ? payload.evidenceReference || undefined
          : current.evidenceReference,
      notes:
        payload.notes !== undefined ? payload.notes || undefined : current.notes,
      recordedAt: current.recordedAt,
      recordedBy:
        payload.recordedBy != null ? payload.recordedBy : current.recordedBy,
    };
  }

  function create(payload) {
    payload = payload || {};
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var paymentId = nextId_();
    var canonical = {
      paymentId: paymentId,
      submissionId: String(payload.submissionId || "").trim(),
      receivedAmount: readAmount_(payload.receivedAmount),
      currency: payload.currency || "NGN",
      receivedAt: payload.receivedAt || now,
      reference: payload.reference || undefined,
      method: payload.method || undefined,
      evidenceReference: payload.evidenceReference || undefined,
      notes: payload.notes || undefined,
      recordedAt: payload.recordedAt || now,
      recordedBy: payload.recordedBy || "",
    };
    var rowIndex = sheet.getLastRow() + 1;
    writeRow_(sheet, rowIndex, canonical);
    return canonical;
  }

  function update(paymentId, payload) {
    var rowIndex = findRowIndex_(paymentId);
    if (rowIndex === -1) return null;
    var current = getById(paymentId);
    if (!current) return null;
    var merged = mergeCanonical_(current, payload || {});
    var sheet = getSheet_();
    writeRow_(sheet, rowIndex, merged);
    return merged;
  }

  return {
    getAll: getAll,
    getById: getById,
    listAllBySubmissionId: listAllBySubmissionId,
    create: create,
    update: update,
  };
})();
