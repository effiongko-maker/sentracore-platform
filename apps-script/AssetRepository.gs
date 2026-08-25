/**
 * AssetRepository.gs
 *
 * Sheet: Assets
 *
 * Reads/writes by HEADER NAME only (never positional indexes).
 * Live sheets may use display headers ("Asset ID", "Facility ID", …) or
 * camelCase. Unknown columns are preserved on update.
 *
 * Canonical API record fields:
 *   id, assetTag, name, category, facilityId, manufacturer, model,
 *   serialNumber, assignedTo, purchaseDate, warrantyExpiry, condition,
 *   status, criticality, description, createdAt, updatedAt
 *
 * `facility` is included as a mirror of facilityId for older clients.
 */

var AssetRepository = (function () {
  var SHEET_NAME = "Assets";

  /**
   * Preferred sheet header → canonical field.
   * First match wins for READ. For WRITE we prefer the first header that
   * already exists on the sheet.
   */
  var FIELD_HEADERS = {
    id: ["Asset ID", "id", "ID", "Id"],
    assetTag: ["Asset Number", "Asset Tag", "assetTag", "Tag"],
    name: ["Asset Name", "name", "Name"],
    category: ["Category", "category"],
    facilityId: ["Facility ID", "facilityId", "facility", "Facility"],
    // Read-only fallback when Facility ID is blank (never a write target).
    facilityNameLegacy: ["Facility Name"],
    manufacturer: ["Manufacturer", "manufacturer"],
    model: ["Model", "model"],
    serialNumber: ["Serial Number", "serialNumber"],
    purchaseDate: ["Install Date", "Purchase Date", "purchaseDate"],
    warrantyExpiry: ["Warranty Expiry", "warrantyExpiry"],
    condition: ["Condition", "condition"],
    status: ["Status", "status"],
    assignedTo: ["Assigned To", "assignedTo", "OEM ID"],
    criticality: ["Criticality", "criticality"],
    description: ["Description", "description"],
    createdAt: ["Created At", "createdAt"],
    updatedAt: ["Updated At", "updatedAt"],
  };

  var CREATE_HEADERS = [
    "Asset ID",
    "Asset Number",
    "Asset Name",
    "Category",
    "Facility ID",
    "Manufacturer",
    "Model",
    "Serial Number",
    "Install Date",
    "Warranty Expiry",
    "Condition",
    "Status",
    "Assigned To",
    "Criticality",
    "Description",
    "Created At",
    "Updated At",
  ];

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, CREATE_HEADERS.length).setValues([CREATE_HEADERS]);
    }
    return sheet;
  }

  function headerMap_(sheet) {
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function firstExistingHeader_(headerMap, candidates) {
    var i;
    for (i = 0; i < candidates.length; i++) {
      if (SheetFieldUtils.hasHeader(headerMap, candidates[i])) {
        return candidates[i];
      }
    }
    return "";
  }

  function readField_(sheetRow, headerMap, candidates) {
    var i;
    for (i = 0; i < candidates.length; i++) {
      var header = candidates[i];
      if (!SheetFieldUtils.hasHeader(headerMap, header)) continue;
      var value = SheetFieldUtils.cellText(sheetRow[header]);
      if (value) return value;
    }
    // Return empty string if header exists but blank; else "".
    var existing = firstExistingHeader_(headerMap, candidates);
    if (existing) return SheetFieldUtils.cellText(sheetRow[existing]);
    return "";
  }

  /**
   * Persist facility as Facility ID. Accepts id, name, or code.
   * Resolution is a separate step — never writes into manufacturer/model.
   */
  function resolveFacilityId_(value) {
    var key = String(value == null ? "" : value).trim();
    if (!key) return "";
    if (typeof FacilityRepository === "undefined") return key;
    try {
      var facilities = FacilityRepository.getAll();
      var i;
      for (i = 0; i < facilities.length; i++) {
        var f = facilities[i];
        if (
          String(f.id) === key ||
          String(f.name) === key ||
          String(f.code) === key
        ) {
          return String(f.id);
        }
      }
    } catch (ignore) {}
    return key;
  }

  function toCanonical_(sheetRow, headerMap, rawCells, headers) {
    var facilityId = readField_(sheetRow, headerMap, FIELD_HEADERS.facilityId);
    // Legacy sheets sometimes store the name under "Facility" / "Facility Name"
    // when Facility ID is empty — keep that in facilityId only if no id column value.
    if (!facilityId) {
      facilityId = readField_(
        sheetRow,
        headerMap,
        FIELD_HEADERS.facilityNameLegacy
      );
    }

    var record = {
      id: readField_(sheetRow, headerMap, FIELD_HEADERS.id),
      assetTag: readField_(sheetRow, headerMap, FIELD_HEADERS.assetTag),
      name: readField_(sheetRow, headerMap, FIELD_HEADERS.name),
      category: readField_(sheetRow, headerMap, FIELD_HEADERS.category) || "other",
      facilityId: facilityId,
      // Mirror for older clients / TS mapper.
      facility: facilityId,
      manufacturer: readField_(
        sheetRow,
        headerMap,
        FIELD_HEADERS.manufacturer
      ),
      model: readField_(sheetRow, headerMap, FIELD_HEADERS.model),
      serialNumber: readField_(
        sheetRow,
        headerMap,
        FIELD_HEADERS.serialNumber
      ),
      purchaseDate: readField_(
        sheetRow,
        headerMap,
        FIELD_HEADERS.purchaseDate
      ),
      warrantyExpiry: readField_(
        sheetRow,
        headerMap,
        FIELD_HEADERS.warrantyExpiry
      ),
      condition:
        readField_(sheetRow, headerMap, FIELD_HEADERS.condition) || "good",
      status: readField_(sheetRow, headerMap, FIELD_HEADERS.status) || "pending",
      assignedTo: readField_(sheetRow, headerMap, FIELD_HEADERS.assignedTo),
      criticality:
        readField_(sheetRow, headerMap, FIELD_HEADERS.criticality) ||
        "unassessed",
      description: readField_(sheetRow, headerMap, FIELD_HEADERS.description),
      createdAt: readField_(sheetRow, headerMap, FIELD_HEADERS.createdAt),
      updatedAt: readField_(sheetRow, headerMap, FIELD_HEADERS.updatedAt),
    };

    if (!record.assetTag) record.assetTag = record.id;
    if (!record.createdAt) record.createdAt = new Date().toISOString();
    if (!record.updatedAt) record.updatedAt = record.createdAt;

    if (rawCells && headers) {
      var byHeader = {};
      var i;
      for (i = 0; i < headers.length; i++) {
        var h = String(headers[i] == null ? "" : headers[i]).trim();
        if (!h) continue;
        byHeader[h] = rawCells[i];
      }
      record._raw = {
        headers: headers.map(function (h) {
          return String(h == null ? "" : h);
        }),
        cells: rawCells.map(function (c) {
          return c;
        }),
        byHeader: byHeader,
      };
    }

    return record;
  }

  function canonicalToSheetFields_(canonical, headerMap) {
    var facilityId = resolveFacilityId_(
      canonical.facilityId != null ? canonical.facilityId : canonical.facility
    );
    var fields = {};

    function setField(fieldKey, value) {
      var header = firstExistingHeader_(headerMap, FIELD_HEADERS[fieldKey]);
      if (!header) return;
      fields[header] = value == null ? "" : value;
    }

    setField("id", canonical.id || "");
    setField("assetTag", canonical.assetTag || canonical.id || "");
    setField("name", canonical.name || "");
    setField("category", canonical.category || "other");
    // Facility ID only — do not write facility name into adjacent columns.
    setField("facilityId", facilityId);
    setField("manufacturer", canonical.manufacturer || "");
    setField("model", canonical.model || "");
    setField("serialNumber", canonical.serialNumber || "");
    setField("purchaseDate", canonical.purchaseDate || "");
    setField("warrantyExpiry", canonical.warrantyExpiry || "");
    setField("condition", canonical.condition || "good");
    setField("status", canonical.status || "pending");
    setField("assignedTo", canonical.assignedTo || "");
    setField("criticality", canonical.criticality || "unassessed");
    setField("description", canonical.description || "");
    setField("createdAt", canonical.createdAt || "");
    setField("updatedAt", canonical.updatedAt || "");

    return fields;
  }

  /**
   * Overlay known fields onto the existing row so unknown columns are preserved.
   * Never shifts values by inventing missing headers mid-row.
   */
  function writeCanonical_(sheet, rowIndex, canonical) {
    var headerMap = headerMap_(sheet);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var existing = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    var row = existing.slice();
    var fields = canonicalToSheetFields_(canonical, headerMap);
    var header;
    for (header in fields) {
      if (!fields.hasOwnProperty(header)) continue;
      if (headerMap[header] === undefined) continue;
      row[headerMap[header]] = fields[header];
    }
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
    return {
      headerMap: headerMap,
      fieldsWritten: fields,
      rowAfter: row,
    };
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    var i;
    for (i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/AST-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "AST-" + padded;
  }

  function nextAssetTag_(id, facilityId) {
    var seqMatch = String(id || "").match(/AST-(\d+)/i);
    var seq = seqMatch
      ? seqMatch[1]
      : ("0000" + String(Date.now()).slice(-4)).slice(-4);
    var facilityKey = String(facilityId || "").trim();
    var facilityCode = "";

    if (facilityKey && typeof FacilityRepository !== "undefined") {
      try {
        var facilities = FacilityRepository.getAll();
        var i;
        for (i = 0; i < facilities.length; i++) {
          var f = facilities[i];
          if (
            String(f.id) === facilityKey ||
            String(f.name) === facilityKey ||
            String(f.code) === facilityKey
          ) {
            facilityCode = String(f.code || f.id || "")
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, "");
            break;
          }
        }
      } catch (ignore) {}
    }

    if (!facilityCode && facilityKey) {
      facilityCode = facilityKey
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 8);
    }

    if (facilityCode) {
      return "AST-" + facilityCode.slice(0, 8) + "-" + seq;
    }
    return id;
  }

  function buildCanonical_(id, payload, createdAt, updatedAt) {
    payload = payload || {};
    var facilityId = resolveFacilityId_(
      payload.facilityId != null ? payload.facilityId : payload.facility
    );
    var suppliedTag = String(payload.assetTag || "").trim();
    return {
      id: id,
      assetTag: suppliedTag || nextAssetTag_(id, facilityId),
      name: payload.name || "",
      category: payload.category || "other",
      facilityId: facilityId,
      facility: facilityId,
      manufacturer: payload.manufacturer || "",
      model: payload.model || "",
      serialNumber: payload.serialNumber || "",
      purchaseDate: payload.purchaseDate || "",
      warrantyExpiry: payload.warrantyExpiry || "",
      condition: payload.condition || "good",
      status: payload.status || "pending",
      assignedTo: payload.assignedTo || "",
      criticality: payload.criticality || "unassessed",
      description: payload.description || "",
      createdAt: createdAt,
      updatedAt: updatedAt,
    };
  }

  function stripRaw_(record) {
    if (!record) return record;
    var copy = {};
    var key;
    for (key in record) {
      if (!record.hasOwnProperty(key)) continue;
      if (key === "_raw" || key === "_diag" || key === "_write") continue;
      copy[key] = record[key];
    }
    return copy;
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var rows = [];
    var r;
    for (r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var canonical = toCanonical_(sheetRow, headerMap, values[r], headers);
      if (!canonical.id) continue;
      // List responses stay lean — drop raw cells.
      rows.push(stripRaw_(canonical));
    }
    return rows;
  }

  function getById(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = firstExistingHeader_(headerMap, FIELD_HEADERS.id);
    if (!idHeader) return null;
    var idCol = headerMap[idHeader];

    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) continue;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var canonical = toCanonical_(sheetRow, headerMap, values[r], headers);
      Logger.log(
        "[asset-map] getById " +
          id +
          " headers=" +
          JSON.stringify(headers) +
          " parsed=" +
          JSON.stringify(stripRaw_(canonical)) +
          " rawByHeader=" +
          JSON.stringify(canonical._raw && canonical._raw.byHeader)
      );
      return canonical;
    }
    return null;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var record = buildCanonical_(id, payload || {}, now, now);
    // Ensure create headers exist for a brand-new sheet; existing sheets keep theirs.
    var headerMap = headerMap_(sheet);
    if (!firstExistingHeader_(headerMap, FIELD_HEADERS.id)) {
      sheet.clear();
      sheet.getRange(1, 1, 1, CREATE_HEADERS.length).setValues([CREATE_HEADERS]);
    }
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var blank = [];
    var b;
    for (b = 0; b < lastCol; b++) blank.push("");
    sheet.appendRow(blank);
    var rowIndex = sheet.getLastRow();
    writeCanonical_(sheet, rowIndex, record);
    SpreadsheetApp.flush();
    return getById(id) || stripRaw_(record);
  }

  function update(id, payload) {
    var BUILD_MARKER = "2026-08-25-facility-diag-v1";
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = firstExistingHeader_(headerMap, FIELD_HEADERS.id);
    if (!idHeader) return null;
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

    var facilityHeader = firstExistingHeader_(
      headerMap,
      FIELD_HEADERS.facilityId
    );
    var facilityCol1 = facilityHeader ? headerMap[facilityHeader] + 1 : -1;
    var facilityBefore = facilityCol1 > 0
      ? String(sheet.getRange(rowIndex, facilityCol1).getValue())
      : String(current.facilityId || "");

    var merged = buildCanonical_(
      id,
      {
        assetTag: current.assetTag || id,
        name: payload.name != null ? payload.name : current.name,
        category: payload.category != null ? payload.category : current.category,
        facilityId:
          payload.facilityId != null
            ? payload.facilityId
            : payload.facility != null
              ? payload.facility
              : current.facilityId,
        manufacturer:
          payload.manufacturer != null
            ? payload.manufacturer
            : current.manufacturer,
        model: payload.model != null ? payload.model : current.model,
        serialNumber:
          payload.serialNumber != null
            ? payload.serialNumber
            : current.serialNumber,
        purchaseDate:
          payload.purchaseDate != null
            ? payload.purchaseDate
            : current.purchaseDate,
        warrantyExpiry:
          payload.warrantyExpiry != null
            ? payload.warrantyExpiry
            : current.warrantyExpiry,
        condition:
          payload.condition != null ? payload.condition : current.condition,
        status: payload.status != null ? payload.status : current.status,
        assignedTo:
          payload.assignedTo != null ? payload.assignedTo : current.assignedTo,
        criticality:
          payload.criticality != null
            ? payload.criticality
            : current.criticality,
        description:
          payload.description != null
            ? payload.description
            : current.description,
      },
      current.createdAt || new Date().toISOString(),
      new Date().toISOString()
    );

    // Preserve immutable asset number.
    merged.assetTag = current.assetTag || merged.assetTag || id;

    var writeInfo = writeCanonical_(sheet, rowIndex, merged);
    SpreadsheetApp.flush();

    var cellAfterFlush =
      facilityCol1 > 0
        ? String(sheet.getRange(rowIndex, facilityCol1).getValue())
        : "";

    var verified = getById(id);
    var diag = {
      buildMarker: BUILD_MARKER,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      sheetName: sheet.getName(),
      headers: headers.map(function (h) {
        return String(h);
      }),
      idHeader: idHeader,
      idCol1: idCol + 1,
      rowIndex1: rowIndex,
      facilityHeader: facilityHeader || "",
      facilityCol1: facilityCol1,
      facilityBeforeObject: String(current.facilityId || current.facility || ""),
      facilityBeforeCells: [
        {
          header: facilityHeader || "",
          col1: facilityCol1,
          value: facilityBefore,
        },
      ],
      requestedFacility: String(
        payload.facilityId != null
          ? payload.facilityId
          : payload.facility != null
            ? payload.facility
            : ""
      ),
      resolvedFacilityWritten: String(merged.facilityId || ""),
      fieldsWritten: writeInfo.fieldsWritten,
      cellAfterFlush: cellAfterFlush,
      facilityAfterCells: [
        {
          header: facilityHeader || "",
          col1: facilityCol1,
          value: cellAfterFlush,
        },
      ],
      verifiedFacility: verified
        ? String(verified.facilityId || verified.facility || "")
        : null,
      verifiedManufacturer: verified ? String(verified.manufacturer || "") : null,
      verifiedModel: verified ? String(verified.model || "") : null,
      sheetChanged: facilityBefore !== cellAfterFlush,
    };

    Logger.log("[asset-diag] result=" + JSON.stringify(diag));

    if (!verified) verified = stripRaw_(merged);
    verified._diag = diag;
    return verified;
  }

  function deactivate(id) {
    return update(id, { status: "inactive" });
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
