/**
 * RequestTreatmentMutationSpike.gs
 *
 * Deprecated Phase 2.5 alias. Prefer RequestTreatmentService.gs.
 * Kept so partial deploys that still reference the spike symbol keep working.
 */

var RequestTreatmentMutationSpike = (function () {
  return {
    createTreatment: function (payload) {
      return RequestTreatmentService.createTreatment(payload);
    },
  };
})();
