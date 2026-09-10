/**
 * ==========================================================
 * SENTRACORE - SLA ENGINE
 * ==========================================================
 *
 * Calculates SLA metrics for operational records.
 * This engine DOES NOT update sheets.
 * It simply returns SLA information.
 */

const SLA_CONFIG = {

  Maintenance: {
    Low: 7,
    Medium: 3,
    High: 1
  }

};

const SLAEngine = {

  calculate: function(record) {

    const priority = record["Priority"] || "Medium";

    const opened = new Date(record["Date Requested"]);

    const slaDays =
      (SLA_CONFIG.Maintenance[priority]) ||
      SLA_CONFIG.Maintenance.Medium;

    const today = new Date();

    const ageDays = daysBetween_(opened, today);

    const daysRemaining = slaDays - ageDays;

    const overdue = daysRemaining < 0;

    let escalationLevel = 0;

    if (daysRemaining < 0)
      escalationLevel = 1;

    if (daysRemaining < -2)
      escalationLevel = 2;

    if (daysRemaining < -5)
      escalationLevel = 3;

    return {

      slaDays: slaDays,

      ageDays: ageDays,

      daysRemaining: daysRemaining,

      overdue: overdue,

      escalationLevel: escalationLevel

    };

  }

};