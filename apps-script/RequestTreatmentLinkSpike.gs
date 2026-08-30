/**
 * RequestTreatmentLinkSpike.gs
 *
 * Deprecated Phase 2.7 alias. Prefer RequestTreatmentService.linkTreatment.
 * Kept so partial deploys that still reference the spike symbol keep working.
 */

var RequestTreatmentLinkSpike = (function () {
  return {
    linkTreatment: function (payload) {
      return RequestTreatmentService.linkTreatment(payload);
    },
  };
})();
