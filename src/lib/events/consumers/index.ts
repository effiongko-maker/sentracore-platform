export type {
  ConsumerRegistration,
  OperationalEventConsumer,
  OperationalEventConsumerContext,
} from "./types";

export {
  buildConsumerContext,
  getConsumersForEventType,
  listRegisteredConsumers,
  orderConsumersByDependency,
  registerOperationalEventConsumer,
} from "./types";

export type {
  ActionOutcome,
  ActionOutcomeStatus,
  ActionRecommendation,
  ActionSignal,
  ActionSignalSeverity,
  DecisionReadyRecommendation,
  RecommendationPriority,
} from "./outcome";

export {
  actionOutcomeFailed,
  actionOutcomeSucceeded,
  isActionOutcome,
} from "./outcome";

export { acknowledgeEventConsumer } from "./acknowledgeEvent";
export {
  analyzeIncidentSignalsConsumer,
  INCIDENT_SIGNAL_RULES,
} from "./analyzeIncidentSignals";
export {
  assessIncidentRiskConsumer,
  INCIDENT_RISK_SCORING,
} from "./assessIncidentRisk";
export type { IncidentRiskLevel, RiskFactor } from "./assessIncidentRisk";
export {
  generateIncidentRecommendationsConsumer,
  RECOMMENDATION_SIGNAL_EVIDENCE,
  RISK_LEVEL_PRIORITY,
  SIGNAL_RECOMMENDATION_PRIORITY_FLOOR,
} from "./generateIncidentRecommendations";
export { assessRecommendationFeedbackConsumer } from "./assessRecommendationFeedback";
export { analyzeRecommendationResponsePatternsConsumer } from "./analyzeRecommendationResponsePatterns";
export { runOperationalEventConsumers } from "./dispatch";
export { bootstrapOperationalEventConsumers } from "./registry";
