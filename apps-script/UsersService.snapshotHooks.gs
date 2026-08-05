/**
 * UsersService.snapshotHooks.gs
 *
 * UserService.gs is not checked into this repo (lives in the deployed Apps Script).
 * Paste these notify calls into the deployed UserService create / update / deactivate
 * paths — same pattern as FacilityService.gs.
 *
 * Soft-deactivate only; there is no restore path today.
 *
 *   function create(payload) {
 *     var created = UserRepository.create(payload);
 *     if (typeof ReportingSnapshotService !== "undefined") {
 *       ReportingSnapshotService.notifyModuleChanged("users");
 *     }
 *     return created;
 *   }
 *
 *   function update(payload) {
 *     var updated = UserRepository.update(payload.id, payload);
 *     if (typeof ReportingSnapshotService !== "undefined") {
 *       ReportingSnapshotService.notifyModuleChanged("users");
 *     }
 *     return updated;
 *   }
 *
 *   function deactivate(payload) {
 *     var updated = UserRepository.deactivate(payload.id);
 *     if (typeof ReportingSnapshotService !== "undefined") {
 *       ReportingSnapshotService.notifyModuleChanged("users");
 *     }
 *     return updated;
 *   }
 */

function __usersSnapshotHooksDocs() {
  // Documentation only — not executed.
}
