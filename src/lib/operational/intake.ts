/** How an operational record entered the platform (metadata for events). */
export type OperationalIntakeSource = "staff" | "occupant" | "system" | "api";

export function mapIntakeToIncidentSource(
  intake: OperationalIntakeSource
): "manual" | "tenant" | "system" | "external" {
  switch (intake) {
    case "staff":
      return "manual";
    case "occupant":
      return "tenant";
    case "system":
      return "system";
    case "api":
      return "external";
  }
}

export function mapIntakeToMaintenanceSource(
  intake: OperationalIntakeSource
): "manual" | "request" | "system" {
  switch (intake) {
    case "occupant":
      return "request";
    case "system":
      return "system";
    case "staff":
    case "api":
    default:
      return "manual";
  }
}
