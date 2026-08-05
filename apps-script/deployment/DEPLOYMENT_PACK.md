# SentraCore Apps Script Deployment Pack

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: npm run apps-script:pack -->

Generated: 2026-08-04T13:40:58.853Z

This document is the **single source of truth** for copying Apps Script
source into the Google Apps Script project.

For each file below:
1. Open or create a script file with the exact `FILE:` name.
2. Replace the entire contents with the block under that heading.
3. Save.

Then follow `DEPLOYMENT_CHECKLIST.md`.

## File index

- ROUTER.gs
- AssetRepository.gs
- AssetsController.gs
- AssetService.gs
- FacilitiesController.gs
- FacilityRepository.gs
- FacilityService.gs
- IncidentRepository.gs
- IncidentsController.gs
- IncidentService.gs
- MaintenanceController.gs
- MaintenanceRepository.gs
- MaintenanceService.gs
- MasterDataController.gs
- MasterDataRepository.gs
- MasterDataService.gs
- ReportingSnapshotController.gs
- ReportingSnapshotRepository.gs
- ReportingSnapshotService.gs
- ReportingSnapshotTriggers.gs
- UsersController.gs
- UserService.gs
- WorkOrderRepository.gs
- WorkOrdersController.gs
- WorkOrderService.gs

======================================
FILE:
ROUTER.gs
======================================

```javascript
/**
 * ROUTER.gs
 *
 * Production Apps Script entrypoint for SentraCore.
 * Copy this file into the Apps Script project as ROUTER.gs (or replace the
 * existing doPost / jsonResponse_ helpers with this complete file).
 *
 * Request envelope:
 * {
 *   resource: "users" | "facilities" | "assets" | "work-orders" |
 *             "incidents" | "maintenance" | "master-data" |
 *             "reporting-snapshot",
 *   action: string,
 *   payload: object
 * }
 *
 * `module` is accepted as an alias for `resource` for backwards compatibility.
 */

function jsonResponse_(success, message, data) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: !!success,
      message: message || "",
      data: data === undefined ? null : data,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};

  try {
    var raw =
      e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    body = JSON.parse(raw || "{}");
  } catch (err) {
    body = {};
  }

  var resource = String(body.resource || body.module || "").trim();
  var action = body.action || "getAll";
  var payload = body.payload || {};

  var result;

  try {
    if (resource === "users") {
      result = UsersController.handle(action, payload);
    } else if (resource === "facilities") {
      result = FacilitiesController.handle(action, payload);
    } else if (resource === "assets") {
      result = AssetsController.handle(action, payload);
    } else if (resource === "work-orders") {
      result = WorkOrdersController.handle(action, payload);
    } else if (resource === "incidents") {
      result = IncidentsController.handle(action, payload);
    } else if (resource === "maintenance") {
      result = MaintenanceController.handle(action, payload);
    } else if (resource === "master-data") {
      result = MasterDataController.handle(action, payload);
    } else if (resource === "reporting-snapshot") {
      result = ReportingSnapshotController.handle(action, payload);
    } else {
      result = jsonResponse_(
        false,
        resource
          ? "Unknown module: " + resource
          : "Missing resource. Expected users|facilities|assets|work-orders|incidents|maintenance|master-data|reporting-snapshot.",
        null
      );
    }
  } catch (error) {
    result = jsonResponse_(
      false,
      (error && error.message) || "Unhandled Apps Script error.",
      null
    );
  }

  return result;
}

/**
 * Optional health check for the Web App deployment URL.
 * GET returns a small JSON payload confirming the script is reachable.
 */
function doGet() {
  return jsonResponse_(true, "SentraCore Apps Script is online.", {
    service: "sentracore",
    resources: [
      "users",
      "facilities",
      "assets",
      "work-orders",
      "incidents",
      "maintenance",
      "master-data",
      "reporting-snapshot",
    ],
  });
}
```

======================================
FILE:
AssetRepository.gs
======================================

```javascript
/**
 * AssetRepository.gs
 *
 * Sheet: Assets
 * Columns (row 1 headers — exact order):
 *   id | assetTag | name | category | facility | manufacturer | model |
 *   serialNumber | purchaseDate | warrantyExpiry | condition | status |
 *   assignedTo | criticality | description | createdAt | updatedAt
 *
 * Mirrors FacilityRepository pattern. Soft-deactivate only — never delete rows.
 */

var AssetRepository = (function () {
  var SHEET_NAME = "Assets";
  var HEADERS = [
    "id",
    "assetTag",
    "name",
    "category",
    "facility",
    "manufacturer",
    "model",
    "serialNumber",
    "purchaseDate",
    "warrantyExpiry",
    "condition",
    "status",
    "assignedTo",
    "criticality",
    "description",
    "createdAt",
    "updatedAt",
  ];

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
    return sheet;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
    }
    return rows;
  }

  function getById(id) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
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

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var row = [
      id,
      payload.assetTag || "",
      payload.name || "",
      payload.category || "other",
      payload.facility || "",
      payload.manufacturer || "",
      payload.model || "",
      payload.serialNumber || "",
      payload.purchaseDate || "",
      payload.warrantyExpiry || "",
      payload.condition || "good",
      payload.status || "pending",
      payload.assignedTo || "",
      payload.criticality || "medium",
      payload.description || "",
      now,
      now,
    ];
    sheet.appendRow(row);
    return getById(id);
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var idCol = headers.indexOf("id");
    var rowIndex = -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id);
    var updated = {
      id: id,
      assetTag: payload.assetTag != null ? payload.assetTag : current.assetTag,
      name: payload.name != null ? payload.name : current.name,
      category: payload.category != null ? payload.category : current.category,
      facility: payload.facility != null ? payload.facility : current.facility,
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
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    var row = HEADERS.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    return updated;
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
```

======================================
FILE:
AssetsController.gs
======================================

```javascript
/**
 * AssetsController.gs
 *
 * Entry for module/resource === "assets".
 * Follows UsersController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "assets",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var AssetsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Assets retrieved.",
            AssetService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Asset retrieved.",
            AssetService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Asset created.",
            AssetService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Asset updated.",
            AssetService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Asset deactivated.",
            AssetService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown assets action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Assets request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
AssetService.gs
======================================

```javascript
/**
 * AssetService.gs
 *
 * Business rules for Assets. Mirrors FacilityService.gs pattern.
 * Never talks to the spreadsheet directly — only AssetRepository.
 */

var AssetService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var category = payload.category;
    var facility = payload.facility;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assetTag || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facility || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.serialNumber || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.manufacturer || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assignedTo || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesCategory =
        !category ||
        category === "all" ||
        String(row.category).toLowerCase() === String(category).toLowerCase();

      var matchesFacility =
        !facility ||
        facility === "all" ||
        String(row.facility) === String(facility);

      return (
        matchesSearch && matchesStatus && matchesCategory && matchesFacility
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = AssetRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Asset id is required.");
    var asset = AssetRepository.getById(id);
    if (!asset) throw new Error("Asset " + id + " not found.");
    return asset;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("Asset name is required.");
    if (!payload.assetTag) throw new Error("Asset tag is required.");
    var created = AssetRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Asset id is required.");
    var updated = AssetRepository.update(payload.id, payload);
    if (!updated) throw new Error("Asset " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Asset id is required.");
    var updated = AssetRepository.deactivate(payload.id);
    if (!updated) throw new Error("Asset " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
FacilitiesController.gs
======================================

```javascript
/**
 * FacilitiesController.gs
 *
 * Entry for module/resource === "facilities".
 * Follows UsersController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "facilities",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var FacilitiesController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Facilities retrieved.",
            FacilityService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Facility retrieved.",
            FacilityService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Facility created.",
            FacilityService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Facility updated.",
            FacilityService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Facility deactivated.",
            FacilityService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown facilities action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Facilities request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
FacilityRepository.gs
======================================

```javascript
/**
 * FacilityRepository.gs
 *
 * Sheet: Facilities
 * Columns (row 1 headers — exact order):
 *   id | name | code | location | type | manager | status | description | createdAt | updatedAt
 *
 * Mirrors UserRepository pattern. Soft-deactivate only — never delete rows.
 */

var FacilityRepository = (function () {
  var SHEET_NAME = "Facilities";
  var HEADERS = [
    "id",
    "name",
    "code",
    "location",
    "type",
    "manager",
    "status",
    "description",
    "createdAt",
    "updatedAt",
  ];

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
    return sheet;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
    }
    return rows;
  }

  function getById(id) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/FAC-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "FAC-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var row = [
      id,
      payload.name || "",
      payload.code || "",
      payload.location || "",
      payload.type || "office",
      payload.manager || "",
      payload.status || "pending",
      payload.description || "",
      now,
      now,
    ];
    sheet.appendRow(row);
    return getById(id);
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var idCol = headers.indexOf("id");
    var rowIndex = -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id);
    var updated = {
      id: id,
      name: payload.name != null ? payload.name : current.name,
      code: payload.code != null ? payload.code : current.code,
      location: payload.location != null ? payload.location : current.location,
      type: payload.type != null ? payload.type : current.type,
      manager: payload.manager != null ? payload.manager : current.manager,
      status: payload.status != null ? payload.status : current.status,
      description:
        payload.description != null ? payload.description : current.description,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    var row = HEADERS.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    return updated;
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
```

======================================
FILE:
FacilityService.gs
======================================

```javascript
/**
 * FacilityService.gs
 *
 * Business rules for Facilities. Mirrors UserService.gs pattern.
 * Never talks to the spreadsheet directly — only FacilityRepository.
 */

var FacilityService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var type = payload.type;
    var location = payload.location;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.code || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.location || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.manager || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status || status === "all" || String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesType =
        !type || type === "all" || String(row.type).toLowerCase() === String(type).toLowerCase();

      var matchesLocation =
        !location ||
        location === "all" ||
        String(row.location) === String(location);

      return matchesSearch && matchesStatus && matchesType && matchesLocation;
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = FacilityRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Facility id is required.");
    var facility = FacilityRepository.getById(id);
    if (!facility) throw new Error("Facility " + id + " not found.");
    return facility;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("Facility name is required.");
    if (!payload.code) throw new Error("Facility code is required.");
    var created = FacilityRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Facility id is required.");
    var updated = FacilityRepository.update(payload.id, payload);
    if (!updated) throw new Error("Facility " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Facility id is required.");
    var updated = FacilityRepository.deactivate(payload.id);
    if (!updated) throw new Error("Facility " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
IncidentRepository.gs
======================================

```javascript
/**
 * IncidentRepository.gs
 *
 * Sheet: existing Incidents sheet (source of truth — do not recreate).
 * Live headers (row 1):
 *   Incident ID | Event ID | Facility ID | Incident Type | Severity |
 *   Description | Reported By | Date Reported | Root Cause |
 *   Corrective Action | Owner | Status
 *
 * Maps spreadsheet fields → frozen canonical Incident model.
 * Soft-deactivate maps to Status=cancelled. Never delete rows.
 */

var IncidentRepository = (function () {
  var SHEET_CANDIDATES = ["Incidents", "INCIDENTS"];

  var SHEET_HEADERS = [
    "Incident ID",
    "Event ID",
    "Facility ID",
    "Incident Type",
    "Severity",
    "Description",
    "Reported By",
    "Date Reported",
    "Root Cause",
    "Corrective Action",
    "Owner",
    "Status",
  ];

  function cellText_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function cellDateIso_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function normalizeEnum_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function mapStatus_(raw) {
    var value = normalizeEnum_(raw);
    if (value === "open") return "reported";
    return value || "reported";
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    // Discover by header: first sheet whose row 1 includes "Incident ID".
    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var lastCol = candidate.getLastColumn();
      if (lastCol < 1) continue;
      var headers = candidate.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).trim() === "Incident ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Incidents sheet not found. Expected a sheet with header "Incident ID".'
    );
  }

  function rowToSheetObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[String(headers[i]).trim()] = row[i];
    }
    return obj;
  }

  /**
   * Map live sheet row → frozen canonical Incident fields.
   */
  function toCanonical_(sheetRow) {
    var description = cellText_(sheetRow["Description"]);
    var reportedAt = cellDateIso_(sheetRow["Date Reported"]);
    var status = mapStatus_(sheetRow["Status"]);
    var severity = normalizeEnum_(sheetRow["Severity"]) || "medium";
    var type = normalizeEnum_(sheetRow["Incident Type"]) || "other";

    return {
      id: cellText_(sheetRow["Incident ID"]),
      // title mirrors description when the sheet has no Title column
      title: description,
      description: description || undefined,
      type: type,
      source: "manual",
      facilityId: cellText_(sheetRow["Facility ID"]),
      assetId: undefined,
      locationDetail: undefined,
      reportedByUserId: cellText_(sheetRow["Reported By"]) || undefined,
      assignedToUserId: cellText_(sheetRow["Owner"]) || undefined,
      assignedGroupId: undefined,
      workOrderId: undefined,
      // TODO: Temporary mapping until the Event Log module is implemented.
      // Event ID is not a parent incident; it will move to a dedicated Event entity.
      parentIncidentId: cellText_(sheetRow["Event ID"]) || undefined,
      reportedAt: reportedAt || new Date().toISOString(),
      discoveredAt: undefined,
      reportedVia: undefined,
      severity: severity,
      peopleAffected: undefined,
      isEmergency: undefined,
      status: status,
      holdReason: undefined,
      requiresWorkOrder: undefined,
      acknowledgedAt: undefined,
      responseDueAt: undefined,
      containedAt: undefined,
      resolvedAt: undefined,
      closedAt: undefined,
      immediateActions: undefined,
      rootCause: cellText_(sheetRow["Root Cause"]) || undefined,
      correctiveActions: cellText_(sheetRow["Corrective Action"]) || undefined,
      preventiveActions: undefined,
      resolutionNotes: undefined,
      createdAt: reportedAt || new Date().toISOString(),
      updatedAt: reportedAt || new Date().toISOString(),
      createdByUserId: undefined,
      updatedByUserId: undefined,
    };
  }

  function canonicalToSheetRow_(canonical) {
    return [
      canonical.id || "",
      canonical.parentIncidentId || "",
      canonical.facilityId || "",
      canonical.type || "other",
      canonical.severity || "medium",
      canonical.description || canonical.title || "",
      canonical.reportedByUserId || "",
      canonical.reportedAt || canonical.createdAt || "",
      canonical.rootCause || "",
      canonical.correctiveActions || "",
      canonical.assignedToUserId || "",
      canonical.status || "reported",
    ];
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var sheetRow = rowToSheetObject_(headers, values[r]);
      var id = cellText_(sheetRow["Incident ID"]);
      if (!id) continue;
      rows.push(toCanonical_(sheetRow));
    }
    return rows;
  }

  function getById(id) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function findRowIndex_(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;

    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Incident ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        return r + 1; // 1-based
      }
    }
    return -1;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/INC-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "INC-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var description = payload.description || payload.title || "";
    var reportedAt = payload.reportedAt || now;

    // Enforce: requiresWorkOrder=false ⇒ workOrderId cleared (sheet has no WO column).
    var requiresWorkOrder = payload.requiresWorkOrder === true;

    var canonical = {
      id: id,
      title: description,
      description: description,
      type: payload.type || "other",
      source: "manual",
      facilityId: payload.facilityId || "",
      reportedByUserId: payload.reportedByUserId || "",
      assignedToUserId: payload.assignedToUserId || "",
      // TODO: Temporary mapping until the Event Log module is implemented.
      parentIncidentId: payload.parentIncidentId || "",
      reportedAt: reportedAt,
      severity: payload.severity || "medium",
      status: payload.status || "reported",
      rootCause: payload.rootCause || "",
      correctiveActions: payload.correctiveActions || "",
      createdAt: reportedAt,
      updatedAt: reportedAt,
      requiresWorkOrder: requiresWorkOrder,
    };

    sheet.appendRow(canonicalToSheetRow_(canonical));
    return getById(id);
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var rowIndex = findRowIndex_(id);
    if (rowIndex === -1) return null;

    var current = getById(id);
    if (!current) return null;

    var description =
      payload.description != null
        ? payload.description
        : payload.title != null
          ? payload.title
          : current.description || current.title || "";

    var reportedAt =
      payload.reportedAt != null
        ? payload.reportedAt
        : current.reportedAt || current.createdAt || "";

    var updated = {
      id: id,
      title: description,
      description: description,
      type: payload.type != null ? payload.type : current.type,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      reportedByUserId:
        payload.reportedByUserId != null
          ? payload.reportedByUserId
          : current.reportedByUserId || "",
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId || "",
      // TODO: Temporary mapping until the Event Log module is implemented.
      parentIncidentId:
        payload.parentIncidentId != null
          ? payload.parentIncidentId
          : current.parentIncidentId || "",
      reportedAt: reportedAt,
      severity:
        payload.severity != null ? payload.severity : current.severity,
      status: payload.status != null ? payload.status : current.status,
      rootCause:
        payload.rootCause != null ? payload.rootCause : current.rootCause || "",
      correctiveActions:
        payload.correctiveActions != null
          ? payload.correctiveActions
          : current.correctiveActions || "",
    };

    sheet
      .getRange(rowIndex, 1, 1, SHEET_HEADERS.length)
      .setValues([canonicalToSheetRow_(updated)]);

    return getById(id);
  }

  function deactivate(id) {
    return update(id, { status: "cancelled" });
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
IncidentsController.gs
======================================

```javascript
/**
 * IncidentsController.gs
 *
 * Entry for module/resource === "incidents".
 * Follows UsersController / WorkOrdersController architecture exactly.
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var IncidentsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Incidents retrieved.",
            IncidentService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Incident retrieved.",
            IncidentService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Incident created.",
            IncidentService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Incident updated.",
            IncidentService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Incident deactivated.",
            IncidentService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown incidents action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Incidents request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
IncidentService.gs
======================================

```javascript
/**
 * IncidentService.gs
 *
 * Business rules for Incidents. Mirrors WorkOrderService.gs.
 * Never talks to the spreadsheet directly — only IncidentRepository.
 */

var IncidentService = (function () {
  function applyWorkOrderRule_(payload) {
    payload = payload || {};
    if (payload.requiresWorkOrder === false || payload.requiresWorkOrder === "false") {
      payload.requiresWorkOrder = false;
      payload.workOrderId = "";
    }
    return payload;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var severity = payload.severity;
    var status = payload.status;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var requiresWorkOrder = payload.requiresWorkOrder;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesSeverity =
        !severity ||
        severity === "all" ||
        String(row.severity).toLowerCase() === String(severity).toLowerCase();

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesRequiresWo = true;
      if (requiresWorkOrder !== undefined && requiresWorkOrder !== "all") {
        var flag =
          row.requiresWorkOrder === true ||
          row.requiresWorkOrder === "true" ||
          row.requiresWorkOrder === 1;
        var wanted =
          requiresWorkOrder === true ||
          requiresWorkOrder === "true" ||
          requiresWorkOrder === 1;
        matchesRequiresWo = flag === wanted;
      }

      return (
        matchesSearch &&
        matchesSeverity &&
        matchesStatus &&
        matchesFacility &&
        matchesAssignee &&
        matchesRequiresWo
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = IncidentRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Incident id is required.");
    var incident = IncidentRepository.getById(id);
    if (!incident) throw new Error("Incident " + id + " not found.");
    return incident;
  }

  function create(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.title) throw new Error("Incident title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = IncidentRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    return created;
  }

  function update(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Incident id is required.");
    var updated = IncidentRepository.update(payload.id, payload);
    if (!updated) throw new Error("Incident " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Incident id is required.");
    var updated = IncidentRepository.deactivate(payload.id);
    if (!updated) throw new Error("Incident " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
MaintenanceController.gs
======================================

```javascript
/**
 * MaintenanceController.gs
 *
 * Entry for module/resource === "maintenance".
 * Follows UsersController / IncidentsController architecture exactly.
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var MaintenanceController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Maintenance retrieved.",
            MaintenanceService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Maintenance retrieved.",
            MaintenanceService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Maintenance created.",
            MaintenanceService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Maintenance updated.",
            MaintenanceService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Maintenance deactivated.",
            MaintenanceService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown maintenance action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Maintenance request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
MaintenanceRepository.gs
======================================

```javascript
/**
 * MaintenanceRepository.gs
 *
 * Sheet: existing Maintenance sheet (source of truth — do not recreate).
 * Live headers (row 1):
 *   Maintenance ID | Event ID | Facility ID | Asset ID | Requester |
 *   Department | Priority | Description | Assigned To |
 *   Date Requested | Date Completed | Status
 *
 * Maps spreadsheet fields → frozen canonical Maintenance model.
 * Soft-deactivate maps to Status=cancelled. Never delete rows.
 */

var MaintenanceRepository = (function () {
  var SHEET_CANDIDATES = ["Maintenance", "MAINTENANCE", "Maintenances"];

  var SHEET_HEADERS = [
    "Maintenance ID",
    "Event ID",
    "Facility ID",
    "Asset ID",
    "Requester",
    "Department",
    "Priority",
    "Description",
    "Assigned To",
    "Date Requested",
    "Date Completed",
    "Status",
  ];

  function cellText_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function cellDateIso_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function normalizeEnum_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function mapStatus_(raw) {
    var value = normalizeEnum_(raw);
    if (value === "open" || value === "new") return "requested";
    return value || "requested";
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    // Discover by header: first sheet whose row 1 includes "Maintenance ID".
    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var lastCol = candidate.getLastColumn();
      if (lastCol < 1) continue;
      var headers = candidate.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).trim() === "Maintenance ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Maintenance sheet not found. Expected a sheet with header "Maintenance ID".'
    );
  }

  function rowToSheetObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[String(headers[i]).trim()] = row[i];
    }
    return obj;
  }

  /**
   * Map live sheet row → frozen canonical Maintenance fields.
   */
  function toCanonical_(sheetRow) {
    var description = cellText_(sheetRow["Description"]);
    var reportedAt = cellDateIso_(sheetRow["Date Requested"]);
    var completedAt = cellDateIso_(sheetRow["Date Completed"]);
    var status = mapStatus_(sheetRow["Status"]);
    var priority = normalizeEnum_(sheetRow["Priority"]) || "medium";
    var now = new Date().toISOString();
    var reported = reportedAt || now;

    return {
      id: cellText_(sheetRow["Maintenance ID"]),
      // title mirrors description when the sheet has no Title column
      title: description,
      description: description || undefined,
      type: "corrective",
      source: "manual",
      categoryId: undefined,
      department: cellText_(sheetRow["Department"]) || undefined,
      facilityId: cellText_(sheetRow["Facility ID"]),
      assetId: cellText_(sheetRow["Asset ID"]) || undefined,
      reportedByUserId: cellText_(sheetRow["Requester"]) || undefined,
      assignedToUserId: cellText_(sheetRow["Assigned To"]) || undefined,
      assignedGroupId: undefined,
      // TODO: Temporary / forward-compatible link to Event Log.
      eventId: cellText_(sheetRow["Event ID"]) || undefined,
      incidentId: undefined,
      workOrderId: undefined,
      parentMaintenanceId: undefined,
      priority: priority,
      status: status,
      holdReason: undefined,
      requiresWorkOrder: undefined,
      reportedAt: reported,
      scheduledStartAt: undefined,
      scheduledEndAt: undefined,
      dueAt: undefined,
      startedAt: undefined,
      completedAt: completedAt || undefined,
      completionNotes: undefined,
      workPerformed: undefined,
      createdAt: reported,
      updatedAt: completedAt || reported,
      createdByUserId: undefined,
      updatedByUserId: undefined,
    };
  }

  function canonicalToSheetRow_(canonical) {
    return [
      canonical.id || "",
      canonical.eventId || "",
      canonical.facilityId || "",
      canonical.assetId || "",
      canonical.reportedByUserId || "",
      canonical.department || "",
      canonical.priority || "medium",
      canonical.description || canonical.title || "",
      canonical.assignedToUserId || "",
      canonical.reportedAt || canonical.createdAt || "",
      canonical.completedAt || "",
      canonical.status || "requested",
    ];
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var sheetRow = rowToSheetObject_(headers, values[r]);
      var id = cellText_(sheetRow["Maintenance ID"]);
      if (!id) continue;
      rows.push(toCanonical_(sheetRow));
    }
    return rows;
  }

  function getById(id) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function findRowIndex_(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;

    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Maintenance ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        return r + 1; // 1-based
      }
    }
    return -1;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/MNT-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "MNT-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var description = payload.description || payload.title || "";
    var reportedAt = payload.reportedAt || now;
    var completedAt = payload.completedAt || "";

    var canonical = {
      id: id,
      title: description,
      description: description,
      type: payload.type || "corrective",
      source: "manual",
      department: payload.department || "",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      reportedByUserId: payload.reportedByUserId || "",
      assignedToUserId: payload.assignedToUserId || "",
      eventId: payload.eventId || "",
      reportedAt: reportedAt,
      completedAt: completedAt,
      priority: payload.priority || "medium",
      status: payload.status || "requested",
      createdAt: reportedAt,
      updatedAt: completedAt || reportedAt,
    };

    sheet.appendRow(canonicalToSheetRow_(canonical));
    return getById(id);
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var rowIndex = findRowIndex_(id);
    if (rowIndex === -1) return null;

    var current = getById(id);
    if (!current) return null;

    var description =
      payload.description != null
        ? payload.description
        : payload.title != null
          ? payload.title
          : current.description || current.title || "";

    var reportedAt =
      payload.reportedAt != null
        ? payload.reportedAt
        : current.reportedAt || current.createdAt || "";

    var completedAt =
      payload.completedAt != null
        ? payload.completedAt
        : current.completedAt || "";

    var updated = {
      id: id,
      title: description,
      description: description,
      department:
        payload.department != null
          ? payload.department
          : current.department || "",
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      assetId: payload.assetId != null ? payload.assetId : current.assetId || "",
      reportedByUserId:
        payload.reportedByUserId != null
          ? payload.reportedByUserId
          : current.reportedByUserId || "",
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId || "",
      eventId:
        payload.eventId != null ? payload.eventId : current.eventId || "",
      reportedAt: reportedAt,
      completedAt: completedAt,
      priority:
        payload.priority != null ? payload.priority : current.priority,
      status: payload.status != null ? payload.status : current.status,
    };

    sheet
      .getRange(rowIndex, 1, 1, SHEET_HEADERS.length)
      .setValues([canonicalToSheetRow_(updated)]);

    return getById(id);
  }

  function deactivate(id) {
    return update(id, { status: "cancelled" });
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
MaintenanceService.gs
======================================

```javascript
/**
 * MaintenanceService.gs
 *
 * Business rules for Maintenance. Mirrors IncidentService.gs.
 * Never talks to the spreadsheet directly — only MaintenanceRepository.
 */

var MaintenanceService = (function () {
  function applyWorkOrderRule_(payload) {
    payload = payload || {};
    if (
      payload.requiresWorkOrder === false ||
      payload.requiresWorkOrder === "false"
    ) {
      payload.requiresWorkOrder = false;
      payload.workOrderId = "";
    }
    return payload;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var priority = payload.priority;
    var status = payload.status;
    var type = payload.type;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var requiresWorkOrder = payload.requiresWorkOrder;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.department || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesPriority =
        !priority ||
        priority === "all" ||
        String(row.priority).toLowerCase() === String(priority).toLowerCase();

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type).toLowerCase() === String(type).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesRequiresWo = true;
      if (requiresWorkOrder !== undefined && requiresWorkOrder !== "all") {
        var flag =
          row.requiresWorkOrder === true ||
          row.requiresWorkOrder === "true" ||
          row.requiresWorkOrder === 1;
        var wanted =
          requiresWorkOrder === true ||
          requiresWorkOrder === "true" ||
          requiresWorkOrder === 1;
        matchesRequiresWo = flag === wanted;
      }

      return (
        matchesSearch &&
        matchesPriority &&
        matchesStatus &&
        matchesType &&
        matchesFacility &&
        matchesAssignee &&
        matchesRequiresWo
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = MaintenanceRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Maintenance id is required.");
    var row = MaintenanceRepository.getById(id);
    if (!row) throw new Error("Maintenance " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || (!payload.title && !payload.description)) {
      throw new Error("Maintenance title is required.");
    }
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = MaintenanceRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    return created;
  }

  function update(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var updated = MaintenanceRepository.update(payload.id, payload);
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var updated = MaintenanceRepository.deactivate(payload.id);
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
MasterDataController.gs
======================================

```javascript
/**
 * MasterDataController.gs
 *
 * Entry for module/resource === "master-data".
 *
 * Expected request body:
 * {
 *   resource: "master-data",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { entity: "departments"|"buildings"|"floors"|"rooms"|"vendors", ... }
 * }
 */

var MasterDataController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Master data retrieved.",
            MasterDataService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Master data item retrieved.",
            MasterDataService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Master data item created.",
            MasterDataService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Master data item updated.",
            MasterDataService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Master data item deactivated.",
            MasterDataService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown master-data action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Master-data request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
MasterDataRepository.gs
======================================

```javascript
/**
 * MasterDataRepository.gs
 *
 * Sheet-backed repositories for master lookup entities:
 *   Departments | Buildings | Floors | Rooms | Vendors
 *
 * Soft-deactivate only — never delete rows.
 * Sheets are created with headers on first access.
 */

var MasterDataRepository = (function () {
  var ENTITIES = {
    departments: {
      sheetName: "Departments",
      idPrefix: "DEP",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    buildings: {
      sheetName: "Buildings",
      idPrefix: "BLD",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    floors: {
      sheetName: "Floors",
      idPrefix: "FLR",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "buildingId",
        "level",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    rooms: {
      sheetName: "Rooms",
      idPrefix: "RM",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "buildingId",
        "floorId",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    vendors: {
      sheetName: "Vendors",
      idPrefix: "VND",
      headers: [
        "id",
        "name",
        "code",
        "category",
        "contactName",
        "email",
        "phone",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
  };

  function getConfig_(entity) {
    var config = ENTITIES[entity];
    if (!config) throw new Error("Unknown master-data entity: " + entity);
    return config;
  }

  function getSheet_(config) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(config.sheetName);
      sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
    }
    return sheet;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  }

  function getAll(entity) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
    }
    return rows;
  }

  function getById(entity, id) {
    var all = getAll(entity);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function nextId_(entity, config) {
    var all = getAll(entity);
    var max = 0;
    var pattern = new RegExp("^" + config.idPrefix + "-(\\d+)$", "i");
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(pattern);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return config.idPrefix + "-" + padded;
  }

  function create(entity, payload) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var now = new Date().toISOString();
    var id = nextId_(entity, config);
    payload = payload || {};

    var record = {};
    for (var i = 0; i < config.headers.length; i++) {
      var key = config.headers[i];
      if (key === "id") record.id = id;
      else if (key === "createdAt" || key === "updatedAt") record[key] = now;
      else if (key === "status") record.status = payload.status || "active";
      else record[key] = payload[key] != null ? payload[key] : "";
    }

    var row = config.headers.map(function (key) {
      return record[key] != null ? record[key] : "";
    });
    sheet.appendRow(row);
    return getById(entity, id);
  }

  function update(entity, id, payload) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var idCol = headers.indexOf("id");
    var rowIndex = -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1;
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(entity, id);
    if (!current) return null;

    var updated = {};
    for (var i = 0; i < config.headers.length; i++) {
      var key = config.headers[i];
      if (key === "id") updated.id = id;
      else if (key === "createdAt") updated.createdAt = current.createdAt;
      else if (key === "updatedAt") updated.updatedAt = new Date().toISOString();
      else if (payload && payload[key] != null) updated[key] = payload[key];
      else updated[key] = current[key] != null ? current[key] : "";
    }

    var row = config.headers.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, config.headers.length).setValues([row]);
    return updated;
  }

  function deactivate(entity, id) {
    return update(entity, id, { status: "inactive" });
  }

  function listEntities() {
    return Object.keys(ENTITIES);
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
    listEntities: listEntities,
  };
})();
```

======================================
FILE:
MasterDataService.gs
======================================

```javascript
/**
 * MasterDataService.gs
 *
 * Business rules for master lookup entities.
 * Never talks to the spreadsheet directly — only MasterDataRepository.
 *
 * Does not notify ReportingSnapshot (master data is lookup-only for now).
 */

var MasterDataService = (function () {
  function normalizeEntity_(payload) {
    var entity = payload && payload.entity;
    if (!entity) throw new Error("Master-data entity is required.");
    entity = String(entity).toLowerCase().trim();
    var known = MasterDataRepository.listEntities();
    if (known.indexOf(entity) === -1) {
      throw new Error("Unknown master-data entity: " + entity);
    }
    return entity;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var facilityId = payload.facilityId;
    var buildingId = payload.buildingId;
    var floorId = payload.floorId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.code || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.category || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.contactName || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.email || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId || "") === String(facilityId);

      var matchesBuilding =
        !buildingId ||
        buildingId === "all" ||
        String(row.buildingId || "") === String(buildingId);

      var matchesFloor =
        !floorId ||
        floorId === "all" ||
        String(row.floorId || "") === String(floorId);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesFacility &&
        matchesBuilding &&
        matchesFloor
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var entity = normalizeEntity_(payload);
    var rows = MasterDataRepository.getAll(entity);
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var entity = normalizeEntity_(payload);
    var id = payload && payload.id;
    if (!id) throw new Error("Master-data id is required.");
    var row = MasterDataRepository.getById(entity, id);
    if (!row) throw new Error(entity + " " + id + " not found.");
    return row;
  }

  function create(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.name) {
      throw new Error("Name is required.");
    }
    return MasterDataRepository.create(entity, payload);
  }

  function update(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.update(entity, payload.id, payload);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    return updated;
  }

  function deactivate(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.deactivate(entity, payload.id);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
ReportingSnapshotController.gs
======================================

```javascript
/**
 * ReportingSnapshotController.gs
 *
 * Entry for module/resource === "reporting-snapshot".
 *
 * Actions:
 *   getSnapshot   — read derived REPORTING_SNAPSHOT (rebuilds on cold miss)
 *   diagnostics   — read-only cache/sheet health (no rebuild / no invalidate)
 *   rebuild       — force full rebuild from domain sheets
 *   refreshModule — partial refresh { module: "facilities" | ... }
 *
 * Uses shared jsonResponse_() — same helper as other controllers.
 */

var ReportingSnapshotController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getSnapshot")) {
        case "getSnapshot":
          return jsonResponse_(
            true,
            "Reporting snapshot loaded.",
            ReportingSnapshotService.getSnapshot(payload)
          );

        case "diagnostics":
          return jsonResponse_(
            true,
            "Reporting snapshot diagnostics.",
            ReportingSnapshotService.diagnostics(payload)
          );

        case "rebuild":
          return jsonResponse_(
            true,
            "Reporting snapshot rebuilt.",
            ReportingSnapshotService.rebuildAll()
          );

        case "refreshModule":
          return jsonResponse_(
            true,
            "Reporting snapshot module refreshed.",
            ReportingSnapshotService.refreshModule(
              payload && payload.module ? payload.module : ""
            )
          );

        default:
          return jsonResponse_(
            false,
            "Unknown reporting-snapshot action: " + action,
            null
          );
      }
    } catch (err) {
      return jsonResponse_(
        false,
        err && err.message ? err.message : String(err),
        null
      );
    }
  }

  return { handle: handle };
})();
```

======================================
FILE:
ReportingSnapshotRepository.gs
======================================

```javascript
/**
 * ReportingSnapshotRepository.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER (Sheets-backed).
 * ---------------------------------------------------------------------------
 * Stores a pre-aggregated ReportingSnapshot in the REPORTING_SNAPSHOT sheet so
 * Home / Dashboard / Reports can read KPIs + summary datasets without scanning
 * every domain sheet on each request.
 *
 * Google Sheets remains the system of record for domain entities.
 * This sheet is a derived cache and can later be replaced by a database-backed
 * repository without changing the application architecture
 * (DashboardService → ReportingService → Snapshot reader).
 *
 * Sheet: REPORTING_SNAPSHOT
 * Columns:
 *   section | scope | chunk | json | updatedAt | version
 *
 * Sections: meta | users | facilities | assets | incidents | maintenance |
 *           workOrders | kpis | projections | health
 */

var ReportingSnapshotRepository = (function () {
  var SHEET_NAME = "REPORTING_SNAPSHOT";
  var SCOPE_PORTFOLIO = "__portfolio__";
  var MAX_CELL_CHARS = 40000;
  var HEADERS = ["section", "scope", "chunk", "json", "updatedAt", "version"];

  var SECTIONS = [
    "meta",
    "users",
    "facilities",
    "assets",
    "incidents",
    "maintenance",
    "workOrders",
    "kpis",
    "projections",
    "health",
  ];

  /** Fully assembled portfolio snapshot JSON (hot-path sheet read). */
  var SECTION_ASSEMBLED = "assembled";

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  function chunkJson_(value) {
    var text = JSON.stringify(value == null ? null : value);
    var chunks = [];
    if (!text.length) {
      chunks.push("");
      return chunks;
    }
    for (var i = 0; i < text.length; i += MAX_CELL_CHARS) {
      chunks.push(text.substring(i, i + MAX_CELL_CHARS));
    }
    return chunks;
  }

  function deleteSectionRows_(sheet, section, scope) {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    // Delete from bottom to top to keep indices stable.
    for (var i = values.length - 1; i >= 0; i--) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  function writeSection(section, data, version, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    version = version || Date.now();
    var sheet = getSheet_();
    deleteSectionRows_(sheet, section, scope);

    var chunks = chunkJson_(data);
    var updatedAt = new Date().toISOString();
    var rows = [];
    for (var i = 0; i < chunks.length; i++) {
      rows.push([section, scope, i, chunks[i], updatedAt, version]);
    }
    if (!rows.length) return;
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
      .setValues(rows);
  }

  function parseChunks_(parts) {
    if (!parts || !parts.length) return null;
    parts.sort(function (a, b) {
      return a.chunk - b.chunk;
    });
    var text = parts
      .map(function (p) {
        return p.json;
      })
      .join("");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] Failed to parse chunked JSON: " + err);
      return null;
    }
  }

  function readSection(section, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    var parts = [];
    for (var i = 0; i < values.length; i++) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        parts.push({
          chunk: Number(values[i][2] || 0),
          json: String(values[i][3] || ""),
        });
      }
    }
    return parseChunks_(parts);
  }

  function writeFull(snapshotParts, version) {
    version = version || Date.now();
    var scope = SCOPE_PORTFOLIO;
    for (var i = 0; i < SECTIONS.length; i++) {
      var section = SECTIONS[i];
      writeSection(section, snapshotParts[section], version, scope);
    }
    return version;
  }

  /**
   * Single sheet scan — avoids N× getValues() when loading all sections.
   */
  function readFull(scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    var bySection = {};
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][1]) !== scope) continue;
      var section = String(values[i][0] || "");
      if (!section || section === SECTION_ASSEMBLED) continue;
      if (!bySection[section]) bySection[section] = [];
      bySection[section].push({
        chunk: Number(values[i][2] || 0),
        json: String(values[i][3] || ""),
      });
    }

    var meta = parseChunks_(bySection.meta);
    if (!meta) return null;

    return {
      meta: meta,
      users: parseChunks_(bySection.users) || [],
      facilities: parseChunks_(bySection.facilities) || [],
      assets: parseChunks_(bySection.assets) || [],
      incidents: parseChunks_(bySection.incidents) || [],
      maintenance: parseChunks_(bySection.maintenance) || [],
      workOrders: parseChunks_(bySection.workOrders) || [],
      kpis: parseChunks_(bySection.kpis),
      projections: parseChunks_(bySection.projections),
      health: parseChunks_(bySection.health),
    };
  }

  function writeAssembled(snapshot, version, scope) {
    writeSection(SECTION_ASSEMBLED, snapshot, version, scope || SCOPE_PORTFOLIO);
  }

  function readAssembled(scope) {
    return readSection(SECTION_ASSEMBLED, scope || SCOPE_PORTFOLIO);
  }

  function clearAll() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow, HEADERS.length).clearContent();
    }
  }

  return {
    SCOPE_PORTFOLIO: SCOPE_PORTFOLIO,
    SECTION_ASSEMBLED: SECTION_ASSEMBLED,
    SECTIONS: SECTIONS,
    getSheet_: getSheet_,
    writeSection: writeSection,
    readSection: readSection,
    writeFull: writeFull,
    readFull: readFull,
    writeAssembled: writeAssembled,
    readAssembled: readAssembled,
    clearAll: clearAll,
  };
})();
```

======================================
FILE:
ReportingSnapshotService.gs
======================================

```javascript
/**
 * ReportingSnapshotService.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER (Sheets-backed).
 * ---------------------------------------------------------------------------
 * Builds and refreshes the REPORTING_SNAPSHOT derived cache from domain
 * repositories. Domain sheets remain the system of record.
 *
 * Partial refresh:
 *   After create/update/deactivate on a module, refresh that module's section
 *   then recompute derived KPIs / projections / health.
 *
 * Full rebuild:
 *   Scheduled trigger + cold-start / explicit rebuild action.
 *
 * Can later be replaced by a database-backed repository without changing
 * DashboardService → ReportingService application architecture.
 *
 * NOTE: Next.js ReportingService re-derives KPIs/projections after load so
 * TypeScript remains the authoritative calculation path for the app.
 * These Apps Script helpers keep sheet-stored values consistent for direct
 * sheet consumers and reduce drift before hydration.
 */

var ReportingSnapshotService = (function () {
  /**
   * CacheService hot path for assembled snapshot JSON.
   * Keys are CONSTANT (not epoch-suffixed). Invalidation uses cache.remove().
   */
  var CACHE_TTL_SECONDS = 21600; // 6h max; also cleared on notify/rebuild/refresh
  var CACHE_KEY_PORTFOLIO = "rs_snap_v1_portfolio";
  var CACHE_KEY_FAC_PREFIX = "rs_snap_v1_fac_";
  var CACHE_MAX_CHARS = 90000; // CacheService ~100KB limit with headroom

  var ACTIVE_ENTITY = {
    active: true,
    operational: true,
    in_service: true,
    online: true,
    open: true,
  };
  var INACTIVE_ENTITY = {
    inactive: true,
    deactivated: true,
    decommissioned: true,
    offline: true,
    archived: true,
    closed: true,
    cancelled: true,
    canceled: true,
    suspended: true,
  };
  var OPERATIONAL_ASSET = {
    active: true,
    operational: true,
    in_service: true,
    online: true,
    available: true,
  };
  var OPEN_WO = {
    draft: true,
    open: true,
    assigned: true,
    in_progress: true,
    on_hold: true,
  };
  var BACKLOG_MNT = {
    requested: true,
    triaged: true,
    scheduled: true,
    in_progress: true,
    on_hold: true,
  };
  var CLOSED_INCIDENT = {
    resolved: true,
    closed: true,
    cancelled: true,
    canceled: true,
  };

  /**
   * Normalize sheet enum/status tokens before comparison.
   * "Active", "ACTIVE", " active ", "On Hold" → active / on_hold
   */
  function normalizeToken_(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  /** Read a field with case-insensitive key fallback (status / Status / STATUS). */
  function fieldValue_(row, key) {
    if (!row || typeof row !== "object") return "";
    if (row[key] != null && row[key] !== "") return row[key];

    var want = String(key).toLowerCase();
    for (var prop in row) {
      if (!Object.prototype.hasOwnProperty.call(row, prop)) continue;
      if (String(prop).toLowerCase() === want) {
        return row[prop];
      }
    }
    return "";
  }

  function rowStatus_(row) {
    return fieldValue_(row, "status");
  }

  function toIsoUtc_(value, fallback) {
    fallback = fallback || new Date().toISOString();
    if (value == null || value === "") return fallback;
    if (Object.prototype.toString.call(value) === "[object Date]") {
      var t = value.getTime();
      return isNaN(t) ? fallback : value.toISOString();
    }
    if (typeof value === "number" && isFinite(value)) {
      var fromNumber = new Date(value);
      return isNaN(fromNumber.getTime()) ? fallback : fromNumber.toISOString();
    }
    var text = String(value).trim();
    if (!text) return fallback;
    var parsed = new Date(text);
    return isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
  }

  function ageInSeconds_(generatedAt, nowMs) {
    nowMs = nowMs || Date.now();
    var ms = Date.parse(generatedAt);
    if (isNaN(ms)) return 0;
    return Math.max(0, Math.floor((nowMs - ms) / 1000));
  }

  /** Facilities / users: Active / ACTIVE / active (and operational synonyms). */
  function isActiveEntityStatus_(status) {
    var token = normalizeToken_(status);
    if (!token) return false;
    if (INACTIVE_ENTITY[token]) return false;
    return !!ACTIVE_ENTITY[token];
  }

  /** Assets: Operational / OPERATIONAL / Active / active count as operational. */
  function isOperationalAssetStatus_(status) {
    var token = normalizeToken_(status);
    if (!token) return false;
    if (INACTIVE_ENTITY[token]) return false;
    return !!(OPERATIONAL_ASSET[token] || ACTIVE_ENTITY[token]);
  }

  function dayKey_(iso, asOf) {
    return toIsoUtc_(iso || asOf, asOf).slice(0, 10);
  }

  function isBeforeDay_(iso, asOf) {
    if (!iso) return false;
    return dayKey_(iso, asOf) < dayKey_(asOf, asOf);
  }

  function isSameDay_(iso, asOf) {
    if (!iso) return false;
    return dayKey_(iso, asOf) === dayKey_(asOf, asOf);
  }

  function isOpenWorkOrder_(wo) {
    return !!OPEN_WO[normalizeToken_(rowStatus_(wo))];
  }

  function isMaintenanceBacklog_(row) {
    return !!BACKLOG_MNT[normalizeToken_(rowStatus_(row))];
  }

  function isCriticalOpenIncident_(incident) {
    return (
      normalizeToken_(fieldValue_(incident, "severity")) === "critical" &&
      !CLOSED_INCIDENT[normalizeToken_(rowStatus_(incident))]
    );
  }

  function isOnHold_(status) {
    return normalizeToken_(status) === "on_hold";
  }

  function isHighOrCritical_(priority) {
    var token = normalizeToken_(priority);
    return token === "high" || token === "critical";
  }

  function safeRepoGetAll_(repo) {
    try {
      if (repo && typeof repo.getAll === "function") {
        return repo.getAll() || [];
      }
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] repository getAll failed: " + err);
    }
    return [];
  }

  function loadDomainRows_() {
    return {
      users:
        typeof UserRepository !== "undefined"
          ? safeRepoGetAll_(UserRepository)
          : [],
      facilities:
        typeof FacilityRepository !== "undefined"
          ? safeRepoGetAll_(FacilityRepository)
          : [],
      assets:
        typeof AssetRepository !== "undefined"
          ? safeRepoGetAll_(AssetRepository)
          : [],
      incidents:
        typeof IncidentRepository !== "undefined"
          ? safeRepoGetAll_(IncidentRepository)
          : [],
      maintenance:
        typeof MaintenanceRepository !== "undefined"
          ? safeRepoGetAll_(MaintenanceRepository)
          : [],
      workOrders:
        typeof WorkOrderRepository !== "undefined"
          ? safeRepoGetAll_(WorkOrderRepository)
          : [],
    };
  }

  function loadModuleRows_(module) {
    if (module === "users") {
      return typeof UserRepository !== "undefined"
        ? safeRepoGetAll_(UserRepository)
        : [];
    }
    if (module === "facilities") {
      return typeof FacilityRepository !== "undefined"
        ? safeRepoGetAll_(FacilityRepository)
        : [];
    }
    if (module === "assets") {
      return typeof AssetRepository !== "undefined"
        ? safeRepoGetAll_(AssetRepository)
        : [];
    }
    if (module === "incidents") {
      return typeof IncidentRepository !== "undefined"
        ? safeRepoGetAll_(IncidentRepository)
        : [];
    }
    if (module === "maintenance") {
      return typeof MaintenanceRepository !== "undefined"
        ? safeRepoGetAll_(MaintenanceRepository)
        : [];
    }
    if (module === "workOrders" || module === "work-orders") {
      return typeof WorkOrderRepository !== "undefined"
        ? safeRepoGetAll_(WorkOrderRepository)
        : [];
    }
    return [];
  }

  function sectionForModule_(module) {
    if (module === "work-orders") return "workOrders";
    return module;
  }

  function scriptCache_() {
    return CacheService.getScriptCache();
  }

  /** Constant CacheService key — must not change between consecutive getSnapshot calls. */
  function snapshotCacheKey_(facilityId) {
    if (facilityId) return CACHE_KEY_FAC_PREFIX + String(facilityId);
    return CACHE_KEY_PORTFOLIO;
  }

  function invalidateSnapshotCache_() {
    try {
      var cache = scriptCache_();
      // Constant-key invalidation (do NOT rotate keys via PropertiesService epoch).
      cache.remove(CACHE_KEY_PORTFOLIO);
      Logger.log(
        "[REPORTING_SNAPSHOT] cache invalidated key=" + CACHE_KEY_PORTFOLIO
      );
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache invalidate failed: " + err);
    }
  }

  function markCacheStatus_(snapshot, status) {
    if (!snapshot) return snapshot;
    if (!snapshot._snapshotMeta) {
      snapshot._snapshotMeta = { source: "REPORTING_SNAPSHOT" };
    }
    snapshot._snapshotMeta.cache = status;
    return snapshot;
  }

  function readCachedSnapshot_(facilityId) {
    try {
      var key = snapshotCacheKey_(facilityId);
      var text = scriptCache_().get(key);
      if (!text) {
        Logger.log("[REPORTING_SNAPSHOT] cache MISS key=" + key);
        return null;
      }
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !parsed.kpis) {
        Logger.log("[REPORTING_SNAPSHOT] cache invalid payload key=" + key);
        return null;
      }
      if (parsed._snapshotMeta) {
        parsed._snapshotMeta.ageInSeconds = ageInSeconds_(
          parsed._snapshotMeta.generatedAt || parsed.asOf
        );
        parsed._snapshotMeta.source =
          parsed._snapshotMeta.source || "REPORTING_SNAPSHOT";
      }
      Logger.log("[REPORTING_SNAPSHOT] cache HIT key=" + key);
      return parsed;
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache read failed: " + err);
      return null;
    }
  }

  function writeCachedSnapshot_(facilityId, snapshot) {
    try {
      if (!snapshot) return false;
      // Never persist transient cache status into the stored value.
      if (snapshot._snapshotMeta && snapshot._snapshotMeta.cache) {
        delete snapshot._snapshotMeta.cache;
      }
      var text = JSON.stringify(snapshot);
      if (!text || text.length > CACHE_MAX_CHARS) {
        Logger.log(
          "[REPORTING_SNAPSHOT] skip cache write — payload too large (" +
            (text ? text.length : 0) +
            " chars)"
        );
        return false;
      }
      var key = snapshotCacheKey_(facilityId);
      var cache = scriptCache_();
      cache.put(key, text, CACHE_TTL_SECONDS);
      // Verify immediately — silent put failures are the usual cause of "no speedup".
      var verify = cache.get(key);
      if (!verify || verify.length !== text.length) {
        Logger.log(
          "[REPORTING_SNAPSHOT] cache put VERIFY FAILED key=" +
            key +
            " wrote=" +
            text.length +
            " read=" +
            (verify ? verify.length : 0)
        );
        return false;
      }
      Logger.log(
        "[REPORTING_SNAPSHOT] cache put ok key=" +
          key +
          " chars=" +
          text.length +
          " ttl=" +
          CACHE_TTL_SECONDS
      );
      return true;
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache write failed: " + err);
      return false;
    }
  }

  function computeKpis_(asOf, rows) {
    asOf = toIsoUtc_(asOf);
    var facilities = rows.facilities || [];
    var assets = rows.assets || [];
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var users = rows.users || [];

    var activeFacilities = facilities.filter(function (f) {
      return isActiveEntityStatus_(rowStatus_(f));
    }).length;
    var activeAssets = assets.filter(function (a) {
      return isOperationalAssetStatus_(rowStatus_(a));
    }).length;
    var openWorkOrders = workOrders.filter(isOpenWorkOrder_);
    var backlog = maintenance.filter(isMaintenanceBacklog_);
    var criticalOpen = incidents.filter(isCriticalOpenIncident_);

    var assetsOperationalPercent =
      assets.length > 0
        ? Math.round((activeAssets / assets.length) * 100)
        : null;

    return {
      activeFacilities: activeFacilities,
      inactiveFacilities: Math.max(0, facilities.length - activeFacilities),
      totalFacilities: facilities.length,
      activeAssets: activeAssets,
      totalAssets: assets.length,
      assetsOperationalPercent: assetsOperationalPercent,
      assetsInPoorCondition: assets.filter(function (a) {
        return normalizeToken_(fieldValue_(a, "condition")) === "poor";
      }).length,
      activeWorkforce: users.filter(function (u) {
        return isActiveEntityStatus_(rowStatus_(u));
      }).length,
      totalUsers: users.length,
      openWorkOrders: openWorkOrders.length,
      workOrdersCreatedToday: workOrders.filter(function (wo) {
        return isSameDay_(
          fieldValue_(wo, "createdAt") || fieldValue_(wo, "requestedAt"),
          asOf
        );
      }).length,
      workOrdersDueToday: openWorkOrders.filter(function (wo) {
        return isSameDay_(fieldValue_(wo, "dueAt"), asOf);
      }).length,
      overdueWorkOrders: openWorkOrders.filter(function (wo) {
        return isBeforeDay_(fieldValue_(wo, "dueAt"), asOf);
      }).length,
      criticalIncidents: criticalOpen.length,
      criticalIncidentsUnassigned: criticalOpen.filter(function (incident) {
        return !String(fieldValue_(incident, "assignedToUserId") || "").trim();
      }).length,
      incidentsNeedingWorkOrder: incidents.filter(function (incident) {
        var requiresRaw = fieldValue_(incident, "requiresWorkOrder");
        var requires =
          requiresRaw === true || normalizeToken_(requiresRaw) === "true";
        return (
          !CLOSED_INCIDENT[normalizeToken_(rowStatus_(incident))] &&
          requires &&
          !String(fieldValue_(incident, "workOrderId") || "").trim()
        );
      }).length,
      maintenanceBacklog: backlog.length,
      overdueMaintenance: backlog.filter(function (row) {
        return isBeforeDay_(fieldValue_(row, "dueAt"), asOf);
      }).length,
      maintenanceOnHold: maintenance.filter(function (row) {
        return isOnHold_(rowStatus_(row));
      }).length,
      workOrdersOnHold: workOrders.filter(function (wo) {
        return isOnHold_(rowStatus_(wo));
      }).length,
    };
  }

  function computeHealth_(kpis) {
    var score = 100;
    score -= Math.min(40, (kpis.criticalIncidents || 0) * 15);
    score -= Math.min(25, (kpis.overdueWorkOrders || 0) * 5);
    score -= Math.min(20, (kpis.overdueMaintenance || 0) * 4);
    score -= Math.min(10, (kpis.assetsInPoorCondition || 0) * 2);
    score -= Math.min(10, (kpis.incidentsNeedingWorkOrder || 0) * 3);
    score = Math.max(0, Math.min(100, score));

    var band =
      score >= 80 ? "healthy" : score >= 55 ? "watch" : "critical";
    var summary =
      band === "healthy"
        ? "Here's what's happening across your facilities today."
        : band === "watch"
          ? "Some items need attention before end of day."
          : "Critical pressure detected — review open incidents and overdue work.";

    return { band: band, score: score, summary: summary };
  }

  function labelize_(value) {
    return normalizeToken_(value)
      .split("_")
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function toneFromPriority_(priority) {
    var p = normalizeToken_(priority);
    if (p === "critical") return "danger";
    if (p === "high") return "warning";
    if (p === "medium") return "info";
    return "neutral";
  }

  /** Newest first; stable secondary key for deterministic ordering. */
  function sortByDateDesc_(rows, getDate, getTieBreaker) {
    return (rows || []).slice().sort(function (a, b) {
      var left = toIsoUtc_(getDate(a) || "", "1970-01-01T00:00:00.000Z");
      var right = toIsoUtc_(getDate(b) || "", "1970-01-01T00:00:00.000Z");
      if (left < right) return 1;
      if (left > right) return -1;
      var leftId = String(getTieBreaker ? getTieBreaker(a) : "");
      var rightId = String(getTieBreaker ? getTieBreaker(b) : "");
      if (leftId < rightId) return -1;
      if (leftId > rightId) return 1;
      return 0;
    });
  }

  function projectWorkOrder_(wo) {
    var status = normalizeToken_(rowStatus_(wo));
    var priority = normalizeToken_(fieldValue_(wo, "priority"));
    return {
      module: "work-orders",
      entityId: wo.id,
      title: wo.title || wo.id,
      status: status,
      priority: priority,
      facilityId: fieldValue_(wo, "facilityId") || wo.facilityId,
      meta: labelize_(priority) + " · " + labelize_(status),
      reportedAt: fieldValue_(wo, "requestedAt")
        ? toIsoUtc_(fieldValue_(wo, "requestedAt"))
        : fieldValue_(wo, "requestedAt"),
      tone: toneFromPriority_(priority),
    };
  }

  function projectMaintenance_(row) {
    var status = normalizeToken_(rowStatus_(row));
    var priority = normalizeToken_(fieldValue_(row, "priority"));
    return {
      module: "maintenance",
      entityId: row.id,
      title: row.title || row.id,
      status: status,
      priority: priority,
      facilityId: fieldValue_(row, "facilityId") || row.facilityId,
      meta: labelize_(priority) + " · " + labelize_(status),
      reportedAt: fieldValue_(row, "reportedAt")
        ? toIsoUtc_(fieldValue_(row, "reportedAt"))
        : fieldValue_(row, "reportedAt"),
      tone: toneFromPriority_(priority),
    };
  }

  function projectIncident_(incident) {
    var status = normalizeToken_(rowStatus_(incident));
    var severity = normalizeToken_(fieldValue_(incident, "severity"));
    return {
      module: "incidents",
      entityId: incident.id,
      title: incident.title || incident.id,
      status: status,
      priority: severity,
      facilityId: fieldValue_(incident, "facilityId") || incident.facilityId,
      meta: labelize_(severity) + " · " + labelize_(status),
      reportedAt: fieldValue_(incident, "reportedAt")
        ? toIsoUtc_(fieldValue_(incident, "reportedAt"))
        : fieldValue_(incident, "reportedAt"),
      tone: toneFromPriority_(severity),
    };
  }

  function computeProjections_(asOf, rows) {
    asOf = toIsoUtc_(asOf);
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var LIST_LIMIT = 5;

    function isOverdueWo(wo) {
      return (
        isOpenWorkOrder_(wo) &&
        fieldValue_(wo, "dueAt") &&
        isBeforeDay_(fieldValue_(wo, "dueAt"), asOf)
      );
    }
    function isOverdueMnt(row) {
      return (
        isMaintenanceBacklog_(row) &&
        fieldValue_(row, "dueAt") &&
        isBeforeDay_(fieldValue_(row, "dueAt"), asOf)
      );
    }

    var overdueWorkOrders = sortByDateDesc_(
      workOrders.filter(isOverdueWo),
      function (wo) {
        return (
          fieldValue_(wo, "dueAt") ||
          fieldValue_(wo, "requestedAt") ||
          fieldValue_(wo, "createdAt")
        );
      },
      function (wo) {
        return wo.id;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectWorkOrder_);

    var maintenanceAttention = sortByDateDesc_(
      maintenance.filter(function (row) {
        return (
          isOverdueMnt(row) ||
          isOnHold_(rowStatus_(row)) ||
          isHighOrCritical_(fieldValue_(row, "priority"))
        );
      }),
      function (row) {
        return (
          fieldValue_(row, "dueAt") ||
          fieldValue_(row, "reportedAt") ||
          fieldValue_(row, "createdAt")
        );
      },
      function (row) {
        return row.id;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectMaintenance_);

    var blockedItems = sortByDateDesc_(
      workOrders
        .filter(function (wo) {
          return isOnHold_(rowStatus_(wo));
        })
        .map(projectWorkOrder_)
        .concat(
          maintenance
            .filter(function (row) {
              return isOnHold_(rowStatus_(row));
            })
            .map(projectMaintenance_)
        ),
      function (item) {
        return item.reportedAt;
      },
      function (item) {
        return item.entityId;
      }
    ).slice(0, LIST_LIMIT);

    return {
      criticalIncidents: sortByDateDesc_(
        incidents.filter(isCriticalOpenIncident_),
        function (incident) {
          return (
            fieldValue_(incident, "reportedAt") ||
            fieldValue_(incident, "createdAt")
          );
        },
        function (incident) {
          return incident.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectIncident_),
      overdueWorkOrders: overdueWorkOrders,
      maintenanceAttention: maintenanceAttention,
      blockedItems: blockedItems,
      latestOpenWorkOrders: sortByDateDesc_(
        workOrders.filter(isOpenWorkOrder_),
        function (wo) {
          return (
            fieldValue_(wo, "requestedAt") || fieldValue_(wo, "createdAt")
          );
        },
        function (wo) {
          return wo.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectWorkOrder_),
      latestActiveMaintenance: sortByDateDesc_(
        maintenance.filter(isMaintenanceBacklog_),
        function (row) {
          return (
            fieldValue_(row, "reportedAt") || fieldValue_(row, "createdAt")
          );
        },
        function (row) {
          return row.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectMaintenance_),
    };
  }

  function filterByFacilityId_(rows, facilityId) {
    if (!facilityId) return rows || [];
    return (rows || []).filter(function (row) {
      var rowFacilityId = fieldValue_(row, "facilityId");
      if (rowFacilityId && String(rowFacilityId) === String(facilityId)) {
        return true;
      }
      var rowFacility = fieldValue_(row, "facility");
      if (rowFacility && String(rowFacility) === String(facilityId)) {
        return true;
      }
      return false;
    });
  }

  function assembleSnapshot_(parts, facilityId) {
    var asOf = toIsoUtc_(
      (parts.meta && parts.meta.asOf) || new Date().toISOString()
    );
    var generatedAt = toIsoUtc_(
      (parts.meta && parts.meta.generatedAt) || asOf,
      asOf
    );
    var version =
      (parts.meta && (parts.meta.snapshotVersion || parts.meta.version)) ||
      generatedAt;

    var facilities = parts.facilities || [];
    if (facilityId) {
      facilities = facilities.filter(function (f) {
        return String(f.id) === String(facilityId);
      });
    }

    var assets = filterByFacilityId_(parts.assets, facilityId);
    var incidents = filterByFacilityId_(parts.incidents, facilityId);
    var maintenance = filterByFacilityId_(parts.maintenance, facilityId);
    var workOrders = filterByFacilityId_(parts.workOrders, facilityId);
    var users = parts.users || [];

    var scopedRows = {
      users: users,
      facilities: facilities,
      assets: assets,
      incidents: incidents,
      maintenance: maintenance,
      workOrders: workOrders,
    };

    // Facility-scoped views must recompute. Portfolio prefers sheet-stored
    // derived fields (already refreshed on notifyModuleChanged / rebuild).
    var kpis;
    var projections;
    var health;
    if (facilityId || !parts.kpis || !parts.projections || !parts.health) {
      kpis = computeKpis_(asOf, scopedRows);
      projections = computeProjections_(asOf, scopedRows);
      health = computeHealth_(kpis);
    } else {
      kpis = parts.kpis;
      projections = parts.projections;
      health = parts.health;
    }

    return {
      asOf: asOf,
      facilityId: facilityId || undefined,
      currentUserId: parts.meta && parts.meta.currentUserId,
      users: users,
      facilities: facilities,
      assets: assets,
      incidents: incidents,
      maintenance: maintenance,
      workOrders: workOrders,
      kpis: kpis,
      projections: projections,
      health: health,
      _snapshotMeta: {
        source: "REPORTING_SNAPSHOT",
        generatedAt: generatedAt,
        ageInSeconds: ageInSeconds_(generatedAt),
        snapshotVersion: version,
        scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
      },
    };
  }

  function persistAssembled_(snapshot, version) {
    if (!snapshot || snapshot.facilityId) return;
    try {
      ReportingSnapshotRepository.writeAssembled(
        snapshot,
        version || Date.now()
      );
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] writeAssembled failed: " + err);
    }
  }

  function touchAssembledMeta_(snapshot) {
    if (!snapshot) return null;
    if (snapshot._snapshotMeta) {
      snapshot._snapshotMeta.ageInSeconds = ageInSeconds_(
        snapshot._snapshotMeta.generatedAt || snapshot.asOf
      );
      snapshot._snapshotMeta.source =
        snapshot._snapshotMeta.source || "REPORTING_SNAPSHOT";
    }
    return snapshot;
  }

  function recomputeDerived_(version) {
    var asOf = new Date().toISOString();
    var parts = {
      users: ReportingSnapshotRepository.readSection("users") || [],
      facilities: ReportingSnapshotRepository.readSection("facilities") || [],
      assets: ReportingSnapshotRepository.readSection("assets") || [],
      incidents: ReportingSnapshotRepository.readSection("incidents") || [],
      maintenance: ReportingSnapshotRepository.readSection("maintenance") || [],
      workOrders: ReportingSnapshotRepository.readSection("workOrders") || [],
    };

    var kpis = computeKpis_(asOf, parts);
    var projections = computeProjections_(asOf, parts);
    var health = computeHealth_(kpis);
    version = version || Date.now();

    ReportingSnapshotRepository.writeSection(
      "meta",
      {
        asOf: asOf,
        generatedAt: asOf,
        version: version,
        snapshotVersion: version,
        scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
      },
      version
    );
    ReportingSnapshotRepository.writeSection("kpis", kpis, version);
    ReportingSnapshotRepository.writeSection("projections", projections, version);
    ReportingSnapshotRepository.writeSection("health", health, version);

    return version;
  }

  function withLock_(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return fn();
    } finally {
      try {
        lock.releaseLock();
      } catch (ignore) {}
    }
  }

  function rebuildAll() {
    return withLock_(function () {
      var started = Date.now();
      Logger.log("[REPORTING_SNAPSHOT] full rebuild start");
      var asOf = new Date().toISOString();
      var rows = loadDomainRows_();
      var kpis = computeKpis_(asOf, rows);
      var projections = computeProjections_(asOf, rows);
      var health = computeHealth_(kpis);
      var version = Date.now();

      ReportingSnapshotRepository.writeFull(
        {
          meta: {
            asOf: asOf,
            generatedAt: asOf,
            version: version,
            snapshotVersion: version,
            scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
          },
          users: rows.users,
          facilities: rows.facilities,
          assets: rows.assets,
          incidents: rows.incidents,
          maintenance: rows.maintenance,
          workOrders: rows.workOrders,
          kpis: kpis,
          projections: projections,
          health: health,
        },
        version
      );

      invalidateSnapshotCache_();
      // Skip assembled section — it is stale until we rewrite it below.
      var snapshot = getSnapshotFromSheetUnlocked_({}, { skipAssembled: true });
      if (snapshot) {
        persistAssembled_(snapshot, version);
        writeCachedSnapshot_(undefined, snapshot);
      }

      Logger.log(
        "[REPORTING_SNAPSHOT] full rebuild done " +
          (Date.now() - started) +
          "ms"
      );
      return snapshot;
    });
  }

  /**
   * Refresh only the affected domain section, then recompute derived KPIs.
   * module: users | facilities | assets | incidents | maintenance | workOrders | work-orders
   */
  function refreshModule(module) {
    return withLock_(function () {
      var section = sectionForModule_(module);
      var started = Date.now();
      Logger.log("[REPORTING_SNAPSHOT] partial refresh module=" + section);

      var rows = loadModuleRows_(module);
      var version = Date.now();
      ReportingSnapshotRepository.writeSection(section, rows, version);
      recomputeDerived_(version);
      invalidateSnapshotCache_();

      // Skip assembled section — it is stale until we rewrite it below.
      var snapshot = getSnapshotFromSheetUnlocked_({}, { skipAssembled: true });
      if (snapshot) {
        persistAssembled_(snapshot, version);
        writeCachedSnapshot_(undefined, snapshot);
      }

      Logger.log(
        "[REPORTING_SNAPSHOT] partial refresh done module=" +
          section +
          " " +
          (Date.now() - started) +
          "ms"
      );
      return snapshot;
    });
  }

  /** Sheet-backed assemble — used on cache miss / after rebuild. */
  function getSnapshotFromSheetUnlocked_(payload, options) {
    payload = payload || {};
    options = options || {};
    var facilityId = payload.facilityId;

    // Prefer pre-serialized portfolio JSON (one section) over multi-section assemble.
    if (!facilityId && !options.skipAssembled) {
      var assembled = touchAssembledMeta_(
        ReportingSnapshotRepository.readAssembled()
      );
      if (assembled && assembled.kpis) {
        return assembled;
      }
    }

    var parts = ReportingSnapshotRepository.readFull();
    if (!parts || !parts.meta || !parts.kpis) {
      return null;
    }
    // Sheet assemble only — do NOT write assembled/cache here.
    // GET must stay read-only aside from CacheService.put in getSnapshot().
    return assembleSnapshot_(parts, facilityId);
  }

  function getSnapshot(payload) {
    payload = payload || {};
    var facilityId = payload.facilityId;

    // 1) CacheService — constant key, no sheet I/O
    var cached = readCachedSnapshot_(facilityId);
    if (cached) {
      return markCacheStatus_(cached, "HIT");
    }

    // 2) Pre-serialized assembled section, else single-pass sheet assemble
    var existing = getSnapshotFromSheetUnlocked_(payload);
    if (existing) {
      writeCachedSnapshot_(facilityId, existing);
      return markCacheStatus_(existing, "MISS");
    }

    Logger.log("[REPORTING_SNAPSHOT] sheet miss — rebuilding");
    var rebuilt = rebuildAll();
    return markCacheStatus_(rebuilt, "MISS");
  }

  /**
   * Read-only operational diagnostics.
   * Does NOT rebuild, does NOT invalidate cache, does NOT write CacheService.
   */
  function diagnostics(payload) {
    payload = payload || {};
    var facilityId = payload.facilityId;
    var started = Date.now();

    var cacheReadStarted = Date.now();
    var cached = readCachedSnapshot_(facilityId);
    var cacheReadMs = Date.now() - cacheReadStarted;

    var snapshot = null;
    var cacheStatus = "MISS";
    var snapshotReadMs = 0;

    if (cached) {
      snapshot = cached;
      cacheStatus = "HIT";
    } else {
      var sheetReadStarted = Date.now();
      // Read-only sheet path — never put cache / never rebuild.
      snapshot = getSnapshotFromSheetUnlocked_(payload);
      snapshotReadMs = Date.now() - sheetReadStarted;
    }

    var meta = (snapshot && snapshot._snapshotMeta) || {};
    var generatedAt =
      (meta && meta.generatedAt) || (snapshot && snapshot.asOf) || null;

    return {
      snapshotVersion:
        meta.snapshotVersion != null ? meta.snapshotVersion : null,
      generatedAt: generatedAt,
      snapshotAgeSeconds: generatedAt ? ageInSeconds_(generatedAt) : null,
      cacheStatus: cacheStatus,
      snapshotSource: meta.source || (snapshot ? "REPORTING_SNAPSHOT" : null),
      users: snapshot && snapshot.users ? snapshot.users.length : 0,
      facilities:
        snapshot && snapshot.facilities ? snapshot.facilities.length : 0,
      assets: snapshot && snapshot.assets ? snapshot.assets.length : 0,
      incidents:
        snapshot && snapshot.incidents ? snapshot.incidents.length : 0,
      maintenance:
        snapshot && snapshot.maintenance ? snapshot.maintenance.length : 0,
      workOrders:
        snapshot && snapshot.workOrders ? snapshot.workOrders.length : 0,
      appsScriptExecutionMs: Date.now() - started,
      cacheReadMs: cacheReadMs,
      snapshotReadMs: snapshotReadMs,
    };
  }

  /**
   * Fire-and-forget style wrapper for domain service hooks.
   * Never throws into CRUD paths.
   */
  function notifyModuleChanged(module) {
    try {
      // refreshModule invalidates + repopulates CacheService.
      refreshModule(module);
    } catch (err) {
      try {
        invalidateSnapshotCache_();
      } catch (ignore) {}
      Logger.log(
        "[REPORTING_SNAPSHOT] notifyModuleChanged failed module=" +
          module +
          " err=" +
          err
      );
    }
  }

  return {
    rebuildAll: rebuildAll,
    refreshModule: refreshModule,
    getSnapshot: getSnapshot,
    diagnostics: diagnostics,
    notifyModuleChanged: notifyModuleChanged,
  };
})();
```

======================================
FILE:
ReportingSnapshotTriggers.gs
======================================

```javascript
/**
 * ReportingSnapshotTriggers.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER — scheduled safety-net rebuild.
 * ---------------------------------------------------------------------------
 * Installs a time-driven trigger that fully rebuilds REPORTING_SNAPSHOT every
 * 10 minutes. Partial refreshes still run on CRUD; this catches drift.
 *
 * Run once (from Apps Script editor):
 *   installReportingSnapshotTrigger()
 *
 * To remove:
 *   removeReportingSnapshotTriggers()
 */

function rebuildReportingSnapshotScheduled() {
  try {
    ReportingSnapshotService.rebuildAll();
  } catch (err) {
    Logger.log(
      "[REPORTING_SNAPSHOT] scheduled rebuild failed: " +
        (err && err.message ? err.message : err)
    );
  }
}

function installReportingSnapshotTrigger() {
  removeReportingSnapshotTriggers();

  ScriptApp.newTrigger("rebuildReportingSnapshotScheduled")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log(
    "[REPORTING_SNAPSHOT] installed 10-minute rebuild trigger"
  );

  // Cold-start: ensure the sheet exists and is populated.
  try {
    ReportingSnapshotService.rebuildAll();
  } catch (err) {
    Logger.log(
      "[REPORTING_SNAPSHOT] initial rebuild failed: " +
        (err && err.message ? err.message : err)
    );
  }
}

function removeReportingSnapshotTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "rebuildReportingSnapshotScheduled") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
```

======================================
FILE:
UsersController.gs
======================================

```javascript
/**
 * UsersController.gs
 *
 * Entry for module/resource === "users".
 *
 * Expected request body:
 * {
 *   resource: "users",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Always returns jsonResponse_(success, message, data).
 * getAll data MUST be the paginated object from UserService.getAll(payload)
 * — do NOT wrap it again as { data: paginated, page, totalPages }.
 */

var UsersController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Users retrieved.",
            UserService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "User retrieved.",
            UserService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "User created.",
            UserService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "User updated.",
            UserService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "User deactivated.",
            UserService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown users action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Users request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
UserService.gs
======================================

```javascript
/**
 * UserService.gs
 *
 * Business rules for Users.
 * Never talks to the spreadsheet directly — only UserRepository.
 *
 * Soft-deactivate only — never delete rows.
 * After create / update / deactivate, refreshes REPORTING_SNAPSHOT users section.
 */

var UserService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var role = payload.role;
    var facility = payload.facility;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.email || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.phone || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.specialization || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facility || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesRole =
        !role ||
        role === "all" ||
        String(row.role).toLowerCase() === String(role).toLowerCase();

      var matchesFacility =
        !facility ||
        facility === "all" ||
        String(row.facility) === String(facility);

      return matchesSearch && matchesStatus && matchesRole && matchesFacility;
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = UserRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("User id is required.");
    var user = UserRepository.getById(id);
    if (!user) throw new Error("User " + id + " not found.");
    return user;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("User name is required.");
    if (!payload.email) throw new Error("User email is required.");
    var created = UserRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("User id is required.");
    var updated = UserRepository.update(payload.id, payload);
    if (!updated) throw new Error("User " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("User id is required.");
    var updated = UserRepository.deactivate(payload.id);
    if (!updated) throw new Error("User " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
WorkOrderRepository.gs
======================================

```javascript
/**
 * WorkOrderRepository.gs
 *
 * Sheet: existing Work Orders sheet (source of truth — do not recreate).
 * Live headers (row 1):
 *   Work Order ID | Event ID | Maintenance ID | Facility ID | Asset ID |
 *   Description | Priority | Assigned To | Completed By | Date Opened |
 *   Date Completed | Date Closed | Status
 *
 * Maps spreadsheet fields → frozen canonical WorkOrder model.
 * Soft-deactivate maps to Status=cancelled. Never delete rows.
 */

var WorkOrderRepository = (function () {
  var SHEET_CANDIDATES = ["Work Orders", "WorkOrders", "WORK_ORDERS"];

  var SHEET_HEADERS = [
    "Work Order ID",
    "Event ID",
    "Maintenance ID",
    "Facility ID",
    "Asset ID",
    "Description",
    "Priority",
    "Assigned To",
    "Completed By",
    "Date Opened",
    "Date Completed",
    "Date Closed",
    "Status",
  ];

  function cellText_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function cellDateIso_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    // Discover by header: first sheet whose row 1 includes "Work Order ID".
    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var lastCol = candidate.getLastColumn();
      if (lastCol < 1) continue;
      var headers = candidate.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).trim() === "Work Order ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Work Orders sheet not found. Expected a sheet with header "Work Order ID".'
    );
  }

  function rowToSheetObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[String(headers[i]).trim()] = row[i];
    }
    return obj;
  }

  /**
   * Map live sheet row → frozen canonical WorkOrder fields.
   */
  function toCanonical_(sheetRow) {
    var description = cellText_(sheetRow["Description"]);
    var requestedAt = cellDateIso_(sheetRow["Date Opened"]);
    var completedAt = cellDateIso_(sheetRow["Date Completed"]);
    var status = cellText_(sheetRow["Status"]).toLowerCase().replace(/\s+/g, "_");
    var priority = cellText_(sheetRow["Priority"])
      .toLowerCase()
      .replace(/\s+/g, "_");

    if (!status) status = "open";
    if (!priority) priority = "medium";

    return {
      id: cellText_(sheetRow["Work Order ID"]),
      title: description,
      description: description || undefined,
      type: "corrective",
      source: "manual",
      facilityId: cellText_(sheetRow["Facility ID"]),
      assetId: cellText_(sheetRow["Asset ID"]) || undefined,
      reportedByUserId: undefined,
      incidentId: cellText_(sheetRow["Event ID"]) || undefined,
      parentWorkOrderId: cellText_(sheetRow["Maintenance ID"]) || undefined,
      assignedToUserId: cellText_(sheetRow["Assigned To"]) || undefined,
      assignedGroupId: undefined,
      requestedAt: requestedAt || undefined,
      scheduledStartAt: undefined,
      scheduledEndAt: undefined,
      dueAt: undefined,
      status: status,
      priority: priority,
      holdReason: undefined,
      startedAt: undefined,
      completedAt: completedAt || undefined,
      estimatedHours: undefined,
      actualHours: undefined,
      estimatedCost: undefined,
      actualCost: undefined,
      completionNotes: undefined,
      workPerformed: undefined,
      downtimeMinutes: undefined,
      slaDueAt: undefined,
      requiresApproval: undefined,
      createdAt: requestedAt || new Date().toISOString(),
      updatedAt: completedAt || requestedAt || new Date().toISOString(),
      createdByUserId: undefined,
      updatedByUserId: undefined,
      // Sheet-only (not part of frozen UI model; kept for write-back)
      _completedBy: cellText_(sheetRow["Completed By"]) || "",
      _dateClosed: cellDateIso_(sheetRow["Date Closed"]) || "",
    };
  }

  function canonicalToSheetRow_(canonical) {
    return [
      canonical.id || "",
      canonical.incidentId || "",
      canonical.parentWorkOrderId || "",
      canonical.facilityId || "",
      canonical.assetId || "",
      canonical.description || canonical.title || "",
      canonical.priority || "medium",
      canonical.assignedToUserId || "",
      canonical._completedBy || "",
      canonical.requestedAt || canonical.createdAt || "",
      canonical.completedAt || "",
      canonical._dateClosed || "",
      canonical.status || "open",
    ];
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var sheetRow = rowToSheetObject_(headers, values[r]);
      var id = cellText_(sheetRow["Work Order ID"]);
      if (!id) continue;
      var canonical = toCanonical_(sheetRow);
      // Strip write-back helpers from API responses
      delete canonical._completedBy;
      delete canonical._dateClosed;
      rows.push(canonical);
    }
    return rows;
  }

  function getById(id) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function findRowIndex_(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;

    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Work Order ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        return r + 1; // 1-based
      }
    }
    return -1;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/WO-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "WO-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var description = payload.description || payload.title || "";
    var requestedAt = payload.requestedAt || payload.createdAt || now;

    var canonical = {
      id: id,
      title: description,
      description: description,
      type: payload.type || "corrective",
      source: payload.source || "manual",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      incidentId: payload.incidentId || "",
      parentWorkOrderId: payload.parentWorkOrderId || "",
      assignedToUserId: payload.assignedToUserId || "",
      requestedAt: requestedAt,
      completedAt: payload.completedAt || "",
      status: payload.status || "open",
      priority: payload.priority || "medium",
      createdAt: requestedAt,
      updatedAt: payload.updatedAt || requestedAt,
      _completedBy: "",
      _dateClosed: "",
    };

    sheet.appendRow(canonicalToSheetRow_(canonical));
    return getById(id);
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var rowIndex = findRowIndex_(id);
    if (rowIndex === -1) return null;

    var current = getById(id);
    if (!current) return null;

    // Re-read sheet-only fields for write-back
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var sheetRow = rowToSheetObject_(headers, values[rowIndex - 1]);
    var completedBy = cellText_(sheetRow["Completed By"]);
    var dateClosed = cellDateIso_(sheetRow["Date Closed"]);

    var description =
      payload.description != null
        ? payload.description
        : payload.title != null
          ? payload.title
          : current.description || current.title || "";

    var requestedAt =
      payload.requestedAt != null
        ? payload.requestedAt
        : current.requestedAt || current.createdAt || "";

    var completedAt =
      payload.completedAt != null ? payload.completedAt : current.completedAt || "";

    var updated = {
      id: id,
      title: description,
      description: description,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      assetId: payload.assetId != null ? payload.assetId : current.assetId || "",
      incidentId:
        payload.incidentId != null ? payload.incidentId : current.incidentId || "",
      parentWorkOrderId:
        payload.parentWorkOrderId != null
          ? payload.parentWorkOrderId
          : current.parentWorkOrderId || "",
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId || "",
      requestedAt: requestedAt,
      completedAt: completedAt,
      status: payload.status != null ? payload.status : current.status,
      priority: payload.priority != null ? payload.priority : current.priority,
      _completedBy: completedBy,
      _dateClosed: dateClosed,
    };

    sheet
      .getRange(rowIndex, 1, 1, SHEET_HEADERS.length)
      .setValues([canonicalToSheetRow_(updated)]);

    return getById(id);
  }

  function deactivate(id) {
    return update(id, { status: "cancelled" });
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
WorkOrdersController.gs
======================================

```javascript
/**
 * WorkOrdersController.gs
 *
 * Entry for module/resource === "work-orders".
 * Follows UsersController / AssetsController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "work-orders",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var WorkOrdersController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Work orders retrieved.",
            WorkOrderService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Work order retrieved.",
            WorkOrderService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Work order created.",
            WorkOrderService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Work order updated.",
            WorkOrderService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Work order deactivated.",
            WorkOrderService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown work-orders action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Work orders request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
WorkOrderService.gs
======================================

```javascript
/**
 * WorkOrderService.gs
 *
 * Business rules for Work Orders. Mirrors FacilityService.gs / AssetService.gs.
 * Never talks to the spreadsheet directly — only WorkOrderRepository.
 */

var WorkOrderService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var priority = payload.priority;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var type = payload.type;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.workInstructions || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assetId || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesPriority =
        !priority ||
        priority === "all" ||
        String(row.priority).toLowerCase() === String(priority).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type).toLowerCase() === String(type).toLowerCase();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesFacility &&
        matchesAssignee &&
        matchesType
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = WorkOrderRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Work order id is required.");
    var workOrder = WorkOrderRepository.getById(id);
    if (!workOrder) throw new Error("Work order " + id + " not found.");
    return workOrder;
  }

  function create(payload) {
    if (!payload || !payload.title) throw new Error("Work order title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = WorkOrderRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.update(payload.id, payload);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.deactivate(payload.id);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

