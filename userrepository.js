/**
 * UserRepository.gs
 *
 * Sheet: USERS (legacy tab alias: Users)
 *
 * Canonical header row — map by exact header name ONLY:
 *   User ID | Full Name | Email | Role | Specialization |
 *   Facility Assigned | Current Workload | Phone | Status | Date Added
 *
 * NEVER write positional arrays. All creates/updates overlay fields by header map.
 * BUILD: 2026-08-25-users-header-v3
 */

var UserRepository = (function () {
  var BUILD_MARKER = "2026-08-25-users-header-v3";
  var CREATE_COUNT_KEY = "USER_REPO_CREATE_INVOCATIONS";
  var SHEET_CANDIDATES = ["USERS", "Users"];

  /** Canonical API field → exact sheet header. */
  var FIELD_TO_HEADER = {
    id: "User ID",
    name: "Full Name",
    email: "Email",
    role: "Role",
    specialization: "Specialization",
    facility: "Facility Assigned",
    activeWorkOrders: "Current Workload",
    phone: "Phone",
    status: "Status",
    createdAt: "Date Added",
  };

  var REQUIRED_HEADERS = [
    "User ID",
    "Full Name",
    "Email",
    "Role",
    "Specialization",
    "Facility Assigned",
    "Current Workload",
    "Phone",
    "Status",
    "Date Added",
  ];

  var UPDATEABLE_FIELDS = [
    "name",
    "email",
    "phone",
    "role",
    "specialization",
    "facility",
    "status",
  ];

  function cellText_(value) {
    return SheetFieldUtils.cellText(value);
  }

  function cellDateIso_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function normalizeStatus_(raw) {
    var value = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!value) return "";
    if (value === "active") return "active";
    if (value === "inactive" || value === "deactivated") return "inactive";
    if (value === "suspended") return "suspended";
    if (value === "pending") return "pending";
    return value;
  }

  function statusToSheet_(status) {
    var value = String(status || "").toLowerCase();
    if (!value) return "";
    if (value === "active") return "Active";
    if (value === "inactive") return "Inactive";
    if (value === "suspended") return "Suspended";
    if (value === "pending") return "Pending";
    return status;
  }

  function parseWorkload_(raw) {
    var text = cellText_(raw);
    if (!text || text === "-") return 0;
    var n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  function workloadToSheet_(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "-";
    return n;
  }

  /** Preserve leading zeros — store phone as plain text. */
  function phoneToSheet_(value) {
    if (value == null || value === "") return "";
    return String(value).trim();
  }

  function stripMeta_(payload) {
    var clean = {};
    var key;
    payload = payload || {};
    for (key in payload) {
      if (!payload.hasOwnProperty(key)) continue;
      if (key === "_clientRequestId") continue;
      clean[key] = payload[key];
    }
    return clean;
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var headerMap = SheetFieldUtils.getHeaderMap(candidate);
      if (headerMap[FIELD_TO_HEADER.id] !== undefined) {
        return candidate;
      }
    }

    throw new Error(
      'USERS sheet not found. Expected tab "USERS" with header "User ID".'
    );
  }

  function headerMap_(sheet) {
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function assertRequiredHeaders_(headerMap) {
    var missing = [];
    var i;
    for (i = 0; i < REQUIRED_HEADERS.length; i++) {
      if (headerMap[REQUIRED_HEADERS[i]] === undefined) {
        missing.push(REQUIRED_HEADERS[i]);
      }
    }
    if (missing.length) {
      throw new Error(
        "USERS sheet missing required headers: " + missing.join(", ")
      );
    }
  }

  function readHeader_(sheetRow, header) {
    return cellText_(sheetRow[header]);
  }

  function toCanonical_(sheetRow) {
    var dateAdded = cellDateIso_(sheetRow[FIELD_TO_HEADER.createdAt]);

    return {
      id: readHeader_(sheetRow, FIELD_TO_HEADER.id),
      name: readHeader_(sheetRow, FIELD_TO_HEADER.name),
      email: readHeader_(sheetRow, FIELD_TO_HEADER.email),
      phone: readHeader_(sheetRow, FIELD_TO_HEADER.phone) || undefined,
      role: readHeader_(sheetRow, FIELD_TO_HEADER.role),
      specialization: readHeader_(sheetRow, FIELD_TO_HEADER.specialization),
      facility: readHeader_(sheetRow, FIELD_TO_HEADER.facility),
      activeWorkOrders: parseWorkload_(
        sheetRow[FIELD_TO_HEADER.activeWorkOrders]
      ),
      status: normalizeStatus_(sheetRow[FIELD_TO_HEADER.status]),
      lastActive: dateAdded || "",
      createdAt: dateAdded || "",
    };
  }

  function canonicalToSheetFields_(canonical, headerMap) {
    var fields = {};
    var fieldKey;

    for (fieldKey in FIELD_TO_HEADER) {
      if (!FIELD_TO_HEADER.hasOwnProperty(fieldKey)) continue;
      var header = FIELD_TO_HEADER[fieldKey];
      if (headerMap[header] === undefined) continue;

      var value = canonical[fieldKey];
      if (fieldKey === "status") {
        fields[header] = statusToSheet_(value);
      } else if (fieldKey === "activeWorkOrders") {
        fields[header] = workloadToSheet_(value);
      } else if (fieldKey === "phone") {
        fields[header] = phoneToSheet_(value);
      } else if (fieldKey === "createdAt") {
        fields[header] = value == null ? "" : value;
      } else {
        fields[header] = value == null ? "" : value;
      }
    }
    return fields;
  }

  function bumpCreateInvocationCount_() {
    var props = PropertiesService.getScriptProperties();
    var current = Number(props.getProperty(CREATE_COUNT_KEY) || "0");
    if (!Number.isFinite(current)) current = 0;
    var next = current + 1;
    props.setProperty(CREATE_COUNT_KEY, String(next));
    return next;
  }

  function logCreate_(details) {
    try {
      Logger.log("[UserRepository.create] " + JSON.stringify(details));
    } catch (ignore) {}
  }

  /**
   * Write only mapped headers onto an existing row. Never shifts columns.
   */
  function writeRowByHeaders_(sheet, rowIndex, fields, headerMap, lastCol) {
    var existing = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    var row = existing.slice();
    var header;
    for (header in fields) {
      if (!fields.hasOwnProperty(header)) continue;
      if (headerMap[header] === undefined) continue;
      row[headerMap[header]] = fields[header];
    }
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);

    if (
      headerMap[FIELD_TO_HEADER.phone] !== undefined &&
      fields[FIELD_TO_HEADER.phone] != null &&
      fields[FIELD_TO_HEADER.phone] !== ""
    ) {
      var phoneCol = headerMap[FIELD_TO_HEADER.phone] + 1;
      sheet.getRange(rowIndex, phoneCol).setNumberFormat("@");
    }

    return row;
  }

  function buildCanonicalForCreate_(id, payload) {
    payload = stripMeta_(payload);
    var now = new Date().toISOString();

    return {
      id: id,
      name: payload.name || "",
      email: payload.email || "",
      phone: payload.phone || undefined,
      role: payload.role || "",
      specialization: payload.specialization || "",
      facility: payload.facility || "",
      activeWorkOrders: 0,
      status: payload.status != null ? payload.status : "",
      lastActive: now,
      createdAt: now,
    };
  }

  function buildCanonicalForUpdate_(id, payload, current) {
    payload = stripMeta_(payload);
    current = current || {};
    var merged = {
      id: id,
      name: current.name || "",
      email: current.email || "",
      phone: current.phone,
      role: current.role || "",
      specialization: current.specialization || "",
      facility: current.facility || "",
      activeWorkOrders:
        current.activeWorkOrders != null ? current.activeWorkOrders : 0,
      status: current.status != null ? current.status : "",
      lastActive: current.lastActive || current.createdAt || "",
      createdAt: current.createdAt || "",
    };

    var i;
    for (i = 0; i < UPDATEABLE_FIELDS.length; i++) {
      var key = UPDATEABLE_FIELDS[i];
      if (payload.hasOwnProperty(key) && payload[key] !== undefined) {
        merged[key] = payload[key];
      }
    }

    if (payload.hasOwnProperty("activeWorkOrders")) {
      merged.activeWorkOrders = payload.activeWorkOrders;
    }

    return merged;
  }

  function verifyCanonicalAgainstRow_(sheetRow, expected) {
    var checks = [
      ["name", FIELD_TO_HEADER.name],
      ["email", FIELD_TO_HEADER.email],
      ["role", FIELD_TO_HEADER.role],
      ["specialization", FIELD_TO_HEADER.specialization],
      ["facility", FIELD_TO_HEADER.facility],
      ["status", FIELD_TO_HEADER.status],
    ];
    var i;
    for (i = 0; i < checks.length; i++) {
      var key = checks[i][0];
      var header = checks[i][1];
      var got = readHeader_(sheetRow, header);
      var want = String(expected[key] == null ? "" : expected[key]);
      if (header === FIELD_TO_HEADER.status) {
        got = normalizeStatus_(got);
        want = normalizeStatus_(want);
      }
      if (String(got) !== String(want)) {
        throw new Error(
          "USERS write verification failed for " +
            header +
            ' (expected "' +
            want +
            '", got "' +
            got +
            '"). Redeploy UserRepository.gs build ' +
            BUILD_MARKER +
            "."
        );
      }
    }
    if (expected.phone) {
      var gotPhone = readHeader_(sheetRow, FIELD_TO_HEADER.phone);
      var wantPhone = phoneToSheet_(expected.phone);
      if (
        String(gotPhone).replace(/^0+/, "") !==
        String(wantPhone).replace(/^0+/, "")
      ) {
        throw new Error(
          'USERS write verification failed for Phone (expected "' +
            wantPhone +
            '", got "' +
            gotPhone +
            '").'
        );
      }
    }
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    var r;
    for (r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var canonical = toCanonical_(sheetRow);
      if (!canonical.id) continue;
      rows.push(canonical);
    }
    return rows;
  }

  function getById(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    if (headerMap[idHeader] === undefined) return null;
    var idCol = headerMap[idHeader];

    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) continue;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      return toCanonical_(sheetRow);
    }
    return null;
  }

  function idExistsOnSheet_(sheet, headerMap, id) {
    var idHeader = FIELD_TO_HEADER.id;
    var idCol = headerMap[idHeader];
    if (idCol === undefined) return false;

    var values = sheet.getDataRange().getValues();
    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) return true;
    }
    return false;
  }

  /** Highest numeric USR suffix on the sheet — ignores malformed IDs. */
  function maxExistingIdSuffix_(sheet, headerMap) {
    var idHeader = FIELD_TO_HEADER.id;
    var idCol = headerMap[idHeader];
    if (idCol === undefined) {
      throw new Error('USERS sheet missing "User ID" header.');
    }

    var values = sheet.getDataRange().getValues();
    var max = 0;
    var r;
    for (r = 1; r < values.length; r++) {
      var match = String(values[r][idCol] || "").match(/^USR-(\d+)$/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    return max;
  }

  /**
   * Increment from the highest USR suffix and verify the candidate is unused.
   * Duplicate/malformed rows cannot reset the counter below the true max suffix.
   */
  function allocateUniqueId_(sheet, headerMap) {
    var suffix = maxExistingIdSuffix_(sheet, headerMap);
    var attempt;
    for (attempt = 0; attempt < 100; attempt++) {
      suffix = suffix + 1;
      var candidate = "USR-" + ("0000" + suffix).slice(-4);
      if (!idExistsOnSheet_(sheet, headerMap, candidate)) {
        return candidate;
      }
    }
    throw new Error(
      "Could not allocate a unique User ID after 100 attempts. Check for duplicate USR rows."
    );
  }

  function create(payload) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error("USERS create busy — another write is in progress.");
    }

    var clientRequestId =
      payload && payload._clientRequestId
        ? String(payload._clientRequestId)
        : "";
    var startedAt = new Date().toISOString();
    var createInvocationCount = bumpCreateInvocationCount_();

    try {
      var sheet = getSheet_();
      var headerMap = headerMap_(sheet);
      assertRequiredHeaders_(headerMap);

      var id = allocateUniqueId_(sheet, headerMap);
      if (idExistsOnSheet_(sheet, headerMap, id)) {
        throw new Error(
          "Refusing to create duplicate User ID " +
            id +
            ". Delete or repair conflicting rows first."
        );
      }

      var record = buildCanonicalForCreate_(id, payload);
      var lastCol = Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length);
      var fields = canonicalToSheetFields_(record, headerMap);
      var row = SheetFieldUtils.buildRowFromFields(headerMap, lastCol, fields);

      logCreate_({
        buildMarker: BUILD_MARKER,
        clientRequestId: clientRequestId,
        startedAt: startedAt,
        createInvocationCount: createInvocationCount,
        generatedId: id,
        fieldsWritten: fields,
      });

      sheet.appendRow(new Array(lastCol).fill(""));
      var rowIndex = sheet.getLastRow();
      sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);

      if (
        headerMap[FIELD_TO_HEADER.phone] !== undefined &&
        fields[FIELD_TO_HEADER.phone] != null &&
        fields[FIELD_TO_HEADER.phone] !== ""
      ) {
        var phoneCol = headerMap[FIELD_TO_HEADER.phone] + 1;
        sheet.getRange(rowIndex, phoneCol).setNumberFormat("@");
      }

      SpreadsheetApp.flush();

      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var writtenRow = SheetFieldUtils.rowToSheetObject(
        headers,
        sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0]
      );
      verifyCanonicalAgainstRow_(writtenRow, record);

      var found = getById(id);
      if (!found) {
        throw new Error(
          "User create wrote row " +
            id +
            " but getById could not re-read it."
        );
      }

      found._write = {
        buildMarker: BUILD_MARKER,
        createPath: "UserRepository.create",
        sheetName: sheet.getName(),
        rowIndex: rowIndex,
        clientRequestId: clientRequestId,
        startedAt: startedAt,
        createInvocationCount: createInvocationCount,
        generatedId: id,
        fieldsWritten: fields,
      };
      return found;
    } finally {
      lock.releaseLock();
    }
  }

  function update(id, payload) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error("USERS update busy — another write is in progress.");
    }

    try {
      var sheet = getSheet_();
      var values = sheet.getDataRange().getValues();
      if (values.length <= 1) return null;

      var headers = values[0];
      var headerMap = headerMap_(sheet);
      assertRequiredHeaders_(headerMap);
      var idHeader = FIELD_TO_HEADER.id;
      if (headerMap[idHeader] === undefined) return null;
      var idCol = headerMap[idHeader];

      var rowIndex = -1;
      var r;
      for (r = 1; r < values.length; r++) {
        if (String(values[r][idCol]) === String(id)) {
          rowIndex = r + 1;
          break;
        }
      }
      if (rowIndex === -1) return null;

      var current = getById(id);
      if (!current) return null;

      var merged = buildCanonicalForUpdate_(id, payload || {}, current);
      var lastCol = Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length);
      var fields = canonicalToSheetFields_(merged, headerMap);
      writeRowByHeaders_(sheet, rowIndex, fields, headerMap, lastCol);
      SpreadsheetApp.flush();

      var writtenRow = SheetFieldUtils.rowToSheetObject(
        headers,
        sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0]
      );
      verifyCanonicalAgainstRow_(writtenRow, merged);
      return getById(id);
    } finally {
      lock.releaseLock();
    }
  }

  function deactivate(id) {
    return update(id, { status: "inactive" });
  }

  function getBuildInfo() {
    return {
      buildMarker: BUILD_MARKER,
      createPath: "UserRepository.create",
      fieldToHeader: FIELD_TO_HEADER,
      createInvocationCount: Number(
        PropertiesService.getScriptProperties().getProperty(CREATE_COUNT_KEY) ||
          "0"
      ),
    };
  }

  /** WO filter dropdown — id/name only. */
  function listFilterCatalog() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    var nameHeader = FIELD_TO_HEADER.name;
    if (!SheetFieldUtils.hasHeader(headerMap, idHeader)) return [];

    var idCol = headerMap[idHeader] + 1;
    var nameCol = SheetFieldUtils.hasHeader(headerMap, nameHeader)
      ? headerMap[nameHeader] + 1
      : -1;
    if (nameCol < 1) return [];

    var idValues = sheet.getRange(2, idCol, lastRow, idCol).getValues();
    var nameValues = sheet.getRange(2, nameCol, lastRow, nameCol).getValues();
    var rows = [];
    var r;
    for (r = 0; r < idValues.length; r++) {
      var id = cellText_(idValues[r][0]);
      if (!id) continue;
      var name = cellText_(nameValues[r][0]) || id;
      rows.push({ id: id, name: name });
    }
    rows.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  }

  return {
    BUILD_MARKER: BUILD_MARKER,
    getAll: getAll,
    getById: getById,
    listFilterCatalog: listFilterCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
    getBuildInfo: getBuildInfo,
  };
})();
