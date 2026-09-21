/**
 * Command Centre — capability constants.
 *
 * Orchestration/entry authority only. Does NOT replace domain capabilities
 * such as platform_finance.request.approve. Does NOT equal Super Admin.
 */

export const COMMAND_CENTRE_CAPABILITIES = {
  /** Enter and view Command Centre surfaces (pulse, exceptions, decisions, assignments). */
  view: "platform.command_centre.view",
  /**
   * Take CEO-authority actions surfaced through Command Centre orchestration.
   * Domain actions still require their own domain capabilities
   * (e.g. Finance approve remains platform_finance.request.approve).
   */
  decide: "platform.command_centre.decide",
  /** See the Executive Commitments register (commitments the actor created or owns). */
  commitmentsView: "platform.command_centre.commitments.view",
  /**
   * Create / edit / complete / cancel Executive Commitments. Separate from `decide`
   * (decision authority) and never implied by being assigned a commitment.
   */
  commitmentsManage: "platform.command_centre.commitments.manage",
} as const;

export type CommandCentreCapability =
  (typeof COMMAND_CENTRE_CAPABILITIES)[keyof typeof COMMAND_CENTRE_CAPABILITIES];

export function isCommandCentreCapability(
  value: unknown
): value is CommandCentreCapability {
  return (
    typeof value === "string" &&
    (Object.values(COMMAND_CENTRE_CAPABILITIES) as string[]).includes(value)
  );
}
