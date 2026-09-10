/**
 * ==========================================================
 * SENTRACORE DECISION ENGINE
 * ==========================================================
 */

const DecisionEngine = {

  evaluateMaintenance: function(record) {

    const priority = record["Priority"] || "Medium";

    const assignedUser = determineAssignment_(record);

    return {

      priority: priority,

      createWorkOrder: true,

      assignRole: assignedUser,

      notifyRoles:
        priority === "High"
          ? ["Supervisor"]
          : [],

      requiresApproval: false

    };

  }

};


/**
 * ==========================================================
 * SMART ASSIGNMENT ENGINE (V2)
 *
 * Assigns the ACTIVE technician with the
 * LOWEST current workload.
 * ==========================================================
 */

function determineAssignment_(record) {

  const description = String(record["Description"] || "").toLowerCase();

  let requiredSkill = "General Technician";

  if (description.includes("generator"))
    requiredSkill = "Electrical Technician";

  else if (
    description.includes("ac") ||
    description.includes("air conditioner") ||
    description.includes("hvac")
  )
    requiredSkill = "HVAC Technician";

  else if (
    description.includes("light") ||
    description.includes("electrical")
  )
    requiredSkill = "Electrical Technician";

  else if (
    description.includes("water") ||
    description.includes("pipe") ||
    description.includes("plumbing")
  )
    requiredSkill = "Plumbing Technician";


  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getRequiredSheet_(ss, "USERS");

  const data = sheet.getDataRange().getValues();

  let chosenUser = null;
  let lowestWorkload = Number.MAX_SAFE_INTEGER;

  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    const fullName = row[1];

    const specialization = row[4];

    const workload = Number(row[6]) || 0;

    const status = String(row[8]).toLowerCase();

    if (
      specialization === requiredSkill &&
      status === "active"
    ) {

      if (workload < lowestWorkload) {

        lowestWorkload = workload;

        chosenUser = fullName;

      }

    }

  }

  return chosenUser || "Unassigned";

}