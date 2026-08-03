/**
 * ROUTER_UPDATE.gs
 *
 * Paste / merge into your existing doPost router.
 *
 * Example pattern:
 *
 * function doPost(e) {
 *   var body = {};
 *   try {
 *     body = JSON.parse(e.postData.contents || "{}");
 *   } catch (err) {
 *     body = {};
 *   }
 *
 *   var resource = body.resource || "";
 *   var action = body.action || "getAll";
 *   var payload = body.payload || {};
 *
 *   var result;
 *
 *   if (resource === "users") {
 *     result = UsersController.handle(action, payload);
 *   } else if (resource === "facilities") {
 *     result = FacilitiesController.handle(action, payload);
 *   } else if (resource === "assets") {
 *     result = AssetsController.handle(action, payload);   // ← ADD THIS
 *   } else {
 *     result = {
 *       success: false,
 *       message: "Unknown resource: " + resource,
 *       data: null,
 *     };
 *   }
 *
 *   return ContentService
 *     .createTextOutput(JSON.stringify(result))
 *     .setMimeType(ContentService.MimeType.JSON);
 * }
 *
 * DEPLOY (Assets):
 * 1. Add AssetsController.gs, AssetService.gs, AssetRepository.gs
 * 2. Create / ensure sheet named "Assets" with headers (see AssetRepository.gs / Assets.sheet.seed.md)
 * 3. Update router as above
 * 4. Deploy → New version of the Web App (execute as Me, access: Anyone)
 */

function __routerSnippetDocs() {
  // This file is documentation only — not executed.
}
