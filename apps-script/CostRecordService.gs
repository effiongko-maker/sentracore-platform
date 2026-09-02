/**
 * CostRecordService.gs
 *
 * Business rules for CostRecord persistence.
 * Never talks to the spreadsheet directly — only CostRecordRepository.
 */

/**
 * Run once from the Apps Script editor after deploying receipt uploads.
 * This deliberately prompts the project owner for the required Drive scope.
 */
function initialiseCostEvidenceStorage() {
  return CostRecordService.initialiseEvidenceStorage();
}

var CostRecordService = (function () {
  var EVIDENCE_FOLDER_NAME = "SentraCore Cost Evidence";
  var MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;
  var VALID_EVIDENCE_MIME_TYPES = {
    "application/pdf": true,
    "image/jpeg": true,
    "image/png": true,
  };
  var VALID_CATEGORIES = {
    diesel_fuel: true,
    materials: true,
    spare_parts: true,
    labour: true,
    transportation: true,
    equipment: true,
    consumables: true,
    service: true,
    other: true,
  };

  var VALID_REIMBURSABILITY = {
    unknown: true,
    reimbursable: true,
    non_reimbursable: true,
  };

  function normalizeEnum_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function validateCreatePayload_(payload) {
    payload = payload || {};
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility id is required.");
    }
    if (!payload.location || !String(payload.location).trim()) {
      throw new Error("Location is required.");
    }
    if (!payload.description || !String(payload.description).trim()) {
      throw new Error("Description is required.");
    }
    if (!payload.recordedBy || !String(payload.recordedBy).trim()) {
      throw new Error("Recorded by is required.");
    }
    var category = normalizeEnum_(payload.category);
    if (!VALID_CATEGORIES[category]) {
      throw new Error("Invalid cost category: " + payload.category);
    }
    var reimbursability = normalizeEnum_(payload.reimbursability || "unknown");
    if (!VALID_REIMBURSABILITY[reimbursability]) {
      throw new Error("Invalid reimbursability: " + payload.reimbursability);
    }
    var evidenceRef =
      payload.evidence && payload.evidence.reference
        ? String(payload.evidence.reference).trim()
        : "";
    if (!evidenceRef) {
      throw new Error("Evidence reference is required.");
    }
    if (payload.actualAmount == null || Number(payload.actualAmount) < 0) {
      throw new Error("Actual amount must be a non-negative number.");
    }
    if (
      payload.budgetedAmount != null &&
      payload.budgetedAmount !== "" &&
      Number(payload.budgetedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
    if (
      payload.estimatedAmount != null &&
      payload.estimatedAmount !== "" &&
      Number(payload.estimatedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
  }

  function evidenceFolder_() {
    var folders = DriveApp.getFoldersByName(EVIDENCE_FOLDER_NAME);
    return folders.hasNext() ? folders.next() : DriveApp.createFolder(EVIDENCE_FOLDER_NAME);
  }

  function initialiseEvidenceStorage() {
    var folder = evidenceFolder_();
    return { id: folder.getId(), name: folder.getName(), url: folder.getUrl() };
  }

  function safeEvidenceFileName_(fileName) {
    var name = String(fileName || "receipt").trim();
    name = name.replace(/[\\\\/:*?"<>|]/g, "-");
    return name || "receipt";
  }

  function uploadEvidence_(evidence) {
    var upload = evidence && evidence.upload;
    if (!upload) return { evidence: evidence, file: null };

    var mimeType = String(upload.mimeType || "").toLowerCase();
    if (!VALID_EVIDENCE_MIME_TYPES[mimeType]) {
      throw new Error("Evidence upload must be a PDF, JPEG, or PNG file.");
    }
    var declaredSize = Number(upload.sizeBytes);
    if (!isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error("Evidence upload must be 5 MB or smaller.");
    }
    var bytes;
    try {
      bytes = Utilities.base64Decode(String(upload.base64 || ""));
    } catch (error) {
      throw new Error("Evidence upload could not be decoded.");
    }
    if (!bytes.length || bytes.length > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error("Evidence upload must be 5 MB or smaller.");
    }

    var fileName = safeEvidenceFileName_(upload.fileName);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = evidenceFolder_().createFile(blob);
    return {
      evidence: {
        reference: String((evidence && evidence.reference) || fileName).trim(),
        fileId: file.getId(),
        fileName: file.getName(),
        mimeType: mimeType,
        sizeBytes: bytes.length,
        fileUrl: file.getUrl(),
      },
      file: file,
    };
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var facilityId = payload.facilityId;
    var category = payload.category;
    var reimbursability = payload.reimbursability;
    var workId = payload.workId;
    var workOrderId = payload.workOrderId;
    var jobOrderId = payload.jobOrderId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.costId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.evidence && row.evidence.reference ? row.evidence.reference : "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesCategory =
        !category ||
        category === "all" ||
        String(row.category) === String(category);

      var matchesReimbursability =
        !reimbursability ||
        reimbursability === "all" ||
        String(row.reimbursability) === String(reimbursability);

      var matchesWorkId =
        !workId || String(row.workId || "") === String(workId);
      var matchesWorkOrderId =
        !workOrderId || String(row.workOrderId || "") === String(workOrderId);
      var matchesJobOrderId =
        !jobOrderId || String(row.jobOrderId || "") === String(jobOrderId);

      return (
        matchesSearch &&
        matchesFacility &&
        matchesCategory &&
        matchesReimbursability &&
        matchesWorkId &&
        matchesWorkOrderId &&
        matchesJobOrderId
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

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.recordedAt || "");
      var bAt = String(b.recordedAt || "");
      if (aAt === bAt) {
        return String(b.costId || "").localeCompare(String(a.costId || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return CostRecordRepository.getAll(auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = CostRecordRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var costId = payload && (payload.costId || payload.id);
    if (!costId) throw new Error("Cost id is required.");
    var row = CostRecordRepository.getById(costId);
    if (!row) throw new Error("Cost record " + costId + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    validateCreatePayload_(payload);
    var uploaded = uploadEvidence_(payload.evidence);
    payload.evidence = uploaded.evidence;
    var created;
    try {
      created = CostRecordRepository.create(payload);
    } catch (error) {
      if (uploaded.file) uploaded.file.setTrashed(true);
      throw error;
    }
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-records");
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var costId = payload.costId || payload.id;
    if (!costId) throw new Error("Cost id is required.");
    if (payload.category != null && !VALID_CATEGORIES[normalizeEnum_(payload.category)]) {
      throw new Error("Invalid cost category: " + payload.category);
    }
    if (
      payload.reimbursability != null &&
      !VALID_REIMBURSABILITY[normalizeEnum_(payload.reimbursability)]
    ) {
      throw new Error("Invalid reimbursability: " + payload.reimbursability);
    }
    if (payload.actualAmount != null && Number(payload.actualAmount) < 0) {
      throw new Error("Actual amount must be a non-negative number.");
    }
    if (
      payload.budgetedAmount != null &&
      payload.budgetedAmount !== "" &&
      Number(payload.budgetedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
    if (
      payload.estimatedAmount != null &&
      payload.estimatedAmount !== "" &&
      Number(payload.estimatedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
    var updated = CostRecordRepository.update(costId, payload);
    if (!updated) throw new Error("Cost record " + costId + " not found.");
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-records");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    initialiseEvidenceStorage: initialiseEvidenceStorage,
  };
})();
