import { OperationalEventTypes } from "../taxonomy";
import { acknowledgeEventConsumer } from "./acknowledgeEvent";
import { analyzeIncidentSignalsConsumer } from "./analyzeIncidentSignals";
import { assessIncidentRiskConsumer } from "./assessIncidentRisk";
import { assessRecommendationFeedbackConsumer } from "./assessRecommendationFeedback";
import { analyzeRecommendationResponsePatternsConsumer } from "./analyzeRecommendationResponsePatterns";
import { generateIncidentRecommendationsConsumer } from "./generateIncidentRecommendations";
import { registerOperationalEventConsumer } from "./types";

let bootstrapped = false;

/**
 * Register built-in Action Engine consumers.
 * Safe to call multiple times (idempotent).
 */
export function bootstrapOperationalEventConsumers(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  registerOperationalEventConsumer({
    actionKey: "system.acknowledge_event",
    eventTypes: [
      OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
      OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    ],
    handler: acknowledgeEventConsumer,
  });

  registerOperationalEventConsumer({
    actionKey: "facility.analyze_incident_signals",
    eventTypes: [
      OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
      /** Phase 19 — canonical Work root (Log Issue → Work). */
      OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    ],
    handler: analyzeIncidentSignalsConsumer,
  });

  registerOperationalEventConsumer({
    actionKey: "facility.assess_incident_risk",
    eventTypes: [
      OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
      OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    ],
    dependsOn: ["facility.analyze_incident_signals"],
    handler: assessIncidentRiskConsumer,
  });

  registerOperationalEventConsumer({
    actionKey: "facility.generate_incident_recommendations",
    eventTypes: [
      OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
      OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    ],
    dependsOn: [
      "facility.analyze_incident_signals",
      "facility.assess_incident_risk",
    ],
    handler: generateIncidentRecommendationsConsumer,
  });

  registerOperationalEventConsumer({
    actionKey: "system.assess_recommendation_feedback",
    eventTypes: [OperationalEventTypes.SYSTEM_RECOMMENDATION_DECIDED],
    handler: assessRecommendationFeedbackConsumer,
  });

  registerOperationalEventConsumer({
    actionKey: "system.analyze_recommendation_response_patterns",
    eventTypes: [OperationalEventTypes.SYSTEM_RECOMMENDATION_DECIDED],
    handler: analyzeRecommendationResponsePatternsConsumer,
  });
}
