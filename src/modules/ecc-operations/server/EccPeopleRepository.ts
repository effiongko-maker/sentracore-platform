import { createAdminClient } from "@/utils/supabase/admin";
import { newEccId } from "@/modules/ecc-operations/ids";
import { nowIso } from "@/modules/ecc-operations/domain/rules";
import type {
  EccAgentDutyStatus,
  EccAgentRow,
  EccAttendanceRecord,
  EccCreatePersonInput,
  EccCurrentShiftSummary,
  EccEnsureCurrentShiftInput,
  EccPeopleSnapshot,
  EccPerson,
  EccPersonRole,
  EccShift,
  EccShiftCoverageStatus,
  EccSignInInput,
  EccSignOutInput,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";

type PersonRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  name: string;
  role: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ShiftRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  label: string;
  starts_at: string;
  ends_at: string;
  is_current: boolean;
  coverage_status: string;
  created_at: string;
  updated_at: string;
};

type AttendanceRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  person_id: string;
  shift_id: string | null;
  attendance_date: string;
  signed_in_at: string | null;
  signed_out_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function db() {
  return createAdminClient();
}

function throwDb(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message?.trim() || fallback);
}

function personToDto(row: PersonRow): EccPerson {
  return {
    id: row.id,
    centreId: row.centre_id,
    name: row.name,
    role: row.role as EccPersonRole,
    contactEmail: row.contact_email ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    status: row.status as EccPerson["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shiftToDto(row: ShiftRow, assignedPersonIds: string[]): EccShift {
  return {
    id: row.id,
    centreId: row.centre_id,
    label: row.label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isCurrent: row.is_current,
    coverageStatus: row.coverage_status as EccShiftCoverageStatus,
    assignedPersonIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeCoverage(
  assigned: number,
  signedIn: number
): EccShiftCoverageStatus {
  if (assigned <= 0) return "unknown";
  if (signedIn <= 0) return "uncovered";
  if (signedIn < assigned) return "constrained";
  return "adequate";
}

export class EccPeopleRepository {
  constructor(private readonly organisationId: string) {}

  async listPeople(centreId = DEFAULT_ECC_CENTRE.id): Promise<EccPerson[]> {
    const { data, error } = await db()
      .from("ecc_people")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .order("name", { ascending: true });
    if (error) throwDb(error, "Failed to list ECC people.");
    return ((data as PersonRow[] | null) ?? []).map(personToDto);
  }

  async getPerson(id: string): Promise<EccPerson | null> {
    const { data, error } = await db()
      .from("ecc_people")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load person.");
    return data ? personToDto(data as PersonRow) : null;
  }

  async createPerson(input: EccCreatePersonInput): Promise<EccPerson> {
    const stamp = nowIso();
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const person: EccPerson = {
      id: newEccId("ECC-PPL"),
      centreId,
      name: input.name.trim(),
      role: input.role,
      contactEmail: input.contactEmail?.trim() || undefined,
      contactPhone: input.contactPhone?.trim() || undefined,
      status: "active",
      createdAt: stamp,
      updatedAt: stamp,
    };
    if (!person.name) throw new Error("Name is required.");
    const { error } = await db().from("ecc_people").insert({
      organisation_id: this.organisationId,
      id: person.id,
      centre_id: person.centreId,
      name: person.name,
      role: person.role,
      contact_email: person.contactEmail ?? null,
      contact_phone: person.contactPhone ?? null,
      status: person.status,
      created_at: person.createdAt,
      updated_at: person.updatedAt,
    });
    if (error) throwDb(error, "Failed to create person.");
    return person;
  }

  async getCurrentShift(
    centreId = DEFAULT_ECC_CENTRE.id
  ): Promise<EccShift | null> {
    const { data, error } = await db()
      .from("ecc_shifts")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .eq("is_current", true)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load current shift.");
    if (!data) return null;
    const assigned = await this.listShiftAssignments(data.id);
    return shiftToDto(data as ShiftRow, assigned);
  }

  async listShiftAssignments(shiftId: string): Promise<string[]> {
    const { data, error } = await db()
      .from("ecc_shift_assignments")
      .select("person_id")
      .eq("organisation_id", this.organisationId)
      .eq("shift_id", shiftId);
    if (error) throwDb(error, "Failed to load shift assignments.");
    return (data ?? []).map((row) => String(row.person_id));
  }

  async ensureCurrentShift(
    input: EccEnsureCurrentShiftInput
  ): Promise<EccShift> {
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const stamp = nowIso();

    // Clear previous current flag for this centre.
    const { error: clearError } = await db()
      .from("ecc_shifts")
      .update({ is_current: false, updated_at: stamp })
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .eq("is_current", true);
    if (clearError) throwDb(clearError, "Failed to clear current shift.");

    const assignedPersonIds = [...new Set(input.assignedPersonIds ?? [])];
    const coverage = computeCoverage(assignedPersonIds.length, 0);
    const shift: EccShift = {
      id: newEccId("ECC-SHF"),
      centreId,
      label: input.label.trim() || "Current shift",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isCurrent: true,
      coverageStatus: coverage,
      assignedPersonIds,
      createdAt: stamp,
      updatedAt: stamp,
    };

    const { error } = await db().from("ecc_shifts").insert({
      organisation_id: this.organisationId,
      id: shift.id,
      centre_id: shift.centreId,
      label: shift.label,
      starts_at: shift.startsAt,
      ends_at: shift.endsAt,
      is_current: true,
      coverage_status: shift.coverageStatus,
      created_at: shift.createdAt,
      updated_at: shift.updatedAt,
    });
    if (error) throwDb(error, "Failed to create shift.");

    if (assignedPersonIds.length > 0) {
      const { error: assignError } = await db()
        .from("ecc_shift_assignments")
        .insert(
          assignedPersonIds.map((personId) => ({
            organisation_id: this.organisationId,
            shift_id: shift.id,
            person_id: personId,
          }))
        );
      if (assignError) throwDb(assignError, "Failed to assign agents to shift.");
    }

    return shift;
  }

  async updateShiftCoverage(
    shiftId: string,
    coverageStatus: EccShiftCoverageStatus
  ): Promise<void> {
    const { error } = await db()
      .from("ecc_shifts")
      .update({
        coverage_status: coverageStatus,
        updated_at: nowIso(),
      })
      .eq("organisation_id", this.organisationId)
      .eq("id", shiftId);
    if (error) throwDb(error, "Failed to update shift coverage.");
  }

  async listOpenAttendance(): Promise<AttendanceRow[]> {
    const { data, error } = await db()
      .from("ecc_attendance")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .not("signed_in_at", "is", null)
      .is("signed_out_at", null);
    if (error) throwDb(error, "Failed to load open attendance.");
    return (data as AttendanceRow[] | null) ?? [];
  }

  async listRecentAttendance(
    centreId = DEFAULT_ECC_CENTRE.id,
    limit = 20
  ): Promise<EccAttendanceRecord[]> {
    const { data, error } = await db()
      .from("ecc_attendance")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("centre_id", centreId)
      .order("attendance_date", { ascending: false })
      .order("signed_in_at", { ascending: false })
      .limit(limit);
    if (error) throwDb(error, "Failed to load attendance history.");
    const rows = (data as AttendanceRow[] | null) ?? [];
    const people = await this.listPeople(centreId);
    const peopleById = new Map(people.map((p) => [p.id, p]));
    const shiftIds = [
      ...new Set(rows.map((r) => r.shift_id).filter(Boolean) as string[]),
    ];
    const shiftLabels = new Map<string, string>();
    if (shiftIds.length > 0) {
      const { data: shifts, error: shiftError } = await db()
        .from("ecc_shifts")
        .select("id, label")
        .eq("organisation_id", this.organisationId)
        .in("id", shiftIds);
      if (shiftError) throwDb(shiftError, "Failed to load shift labels.");
      for (const shift of shifts ?? []) {
        shiftLabels.set(String(shift.id), String(shift.label));
      }
    }

    return rows.map((row) => ({
      id: row.id,
      centreId: row.centre_id,
      personId: row.person_id,
      personName: peopleById.get(row.person_id)?.name ?? row.person_id,
      shiftId: row.shift_id ?? undefined,
      shiftLabel: row.shift_id
        ? shiftLabels.get(row.shift_id) ?? undefined
        : undefined,
      attendanceDate:
        typeof row.attendance_date === "string"
          ? row.attendance_date.slice(0, 10)
          : String(row.attendance_date).slice(0, 10),
      signedInAt: row.signed_in_at ?? undefined,
      signedOutAt: row.signed_out_at ?? undefined,
      status: row.status as EccAgentDutyStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async signIn(input: EccSignInInput): Promise<EccAttendanceRecord> {
    const person = await this.getPerson(input.personId);
    if (!person) throw new Error("Person not found.");
    if (person.role !== "agent") {
      throw new Error("Only agents can sign in for shift attendance.");
    }

    const open = await this.listOpenAttendance();
    if (open.some((row) => row.person_id === person.id)) {
      throw new Error("Agent is already signed in.");
    }

    const current = await this.getCurrentShift(person.centreId);
    const shiftId = input.shiftId ?? current?.id ?? null;
    const stamp = nowIso();
    const recordId = newEccId("ECC-ATT");
    const status: EccAgentDutyStatus =
      current && shiftId === current.id ? "on_duty" : "signed_in";

    const { error } = await db().from("ecc_attendance").insert({
      organisation_id: this.organisationId,
      id: recordId,
      centre_id: person.centreId,
      person_id: person.id,
      shift_id: shiftId,
      attendance_date: stamp.slice(0, 10),
      signed_in_at: stamp,
      signed_out_at: null,
      status,
      created_at: stamp,
      updated_at: stamp,
    });
    if (error) throwDb(error, "Failed to sign in.");

    if (current) {
      const signedIn = (await this.listOpenAttendance()).filter((row) =>
        current.assignedPersonIds.includes(row.person_id)
      ).length;
      await this.updateShiftCoverage(
        current.id,
        computeCoverage(current.assignedPersonIds.length, signedIn)
      );
    }

    return {
      id: recordId,
      centreId: person.centreId,
      personId: person.id,
      personName: person.name,
      shiftId: shiftId ?? undefined,
      shiftLabel: current && shiftId === current.id ? current.label : undefined,
      attendanceDate: stamp.slice(0, 10),
      signedInAt: stamp,
      status,
      createdAt: stamp,
      updatedAt: stamp,
    };
  }

  async signOut(input: EccSignOutInput): Promise<EccAttendanceRecord> {
    const person = await this.getPerson(input.personId);
    if (!person) throw new Error("Person not found.");

    const open = (await this.listOpenAttendance()).find(
      (row) => row.person_id === person.id
    );
    if (!open) throw new Error("Agent is not signed in.");

    const stamp = nowIso();
    const { error } = await db()
      .from("ecc_attendance")
      .update({
        signed_out_at: stamp,
        status: "signed_out",
        updated_at: stamp,
      })
      .eq("organisation_id", this.organisationId)
      .eq("id", open.id);
    if (error) throwDb(error, "Failed to sign out.");

    const current = await this.getCurrentShift(person.centreId);
    if (current) {
      const signedIn = (await this.listOpenAttendance()).filter((row) =>
        current.assignedPersonIds.includes(row.person_id)
      ).length;
      await this.updateShiftCoverage(
        current.id,
        computeCoverage(current.assignedPersonIds.length, signedIn)
      );
    }

    let shiftLabel: string | undefined;
    if (open.shift_id) {
      const { data } = await db()
        .from("ecc_shifts")
        .select("label")
        .eq("organisation_id", this.organisationId)
        .eq("id", open.shift_id)
        .maybeSingle();
      shiftLabel = data ? String(data.label) : undefined;
    }

    return {
      id: open.id,
      centreId: person.centreId,
      personId: person.id,
      personName: person.name,
      shiftId: open.shift_id ?? undefined,
      shiftLabel,
      attendanceDate:
        typeof open.attendance_date === "string"
          ? open.attendance_date.slice(0, 10)
          : String(open.attendance_date).slice(0, 10),
      signedInAt: open.signed_in_at ?? undefined,
      signedOutAt: stamp,
      status: "signed_out",
      createdAt: open.created_at,
      updatedAt: stamp,
    };
  }

  async getPeopleSnapshot(
    centreId = DEFAULT_ECC_CENTRE.id
  ): Promise<EccPeopleSnapshot> {
    const [people, currentShift, openAttendance, recentAttendance] =
      await Promise.all([
        this.listPeople(centreId),
        this.getCurrentShift(centreId),
        this.listOpenAttendance(),
        this.listRecentAttendance(centreId, 20),
      ]);

    const openByPerson = new Map(
      openAttendance.map((row) => [row.person_id, row])
    );
    const assignedSet = new Set(currentShift?.assignedPersonIds ?? []);

    const agents: EccAgentRow[] = people
      .filter((person) => person.role === "agent")
      .map((person) => {
        const open = openByPerson.get(person.id);
        const onCurrentShift = assignedSet.has(person.id);
        let dutyStatus: EccAgentDutyStatus = "off_duty";
        if (open) {
          dutyStatus = onCurrentShift ? "on_duty" : "signed_in";
        } else {
          const latest = recentAttendance.find(
            (row) => row.personId === person.id
          );
          if (latest?.status === "absent") dutyStatus = "absent";
          else if (latest?.status === "signed_out") dutyStatus = "signed_out";
          else dutyStatus = "off_duty";
        }

        return {
          person,
          dutyStatus,
          shiftLabel: onCurrentShift
            ? currentShift?.label
            : open?.shift_id
              ? recentAttendance.find((r) => r.id === open.id)?.shiftLabel
              : undefined,
          signedInAt: open?.signed_in_at ?? undefined,
          signedOutAt: undefined,
          openAttendanceId: open?.id,
        };
      });

    const agentsSignedIn = agents.filter(
      (row) =>
        row.dutyStatus === "on_duty" || row.dutyStatus === "signed_in"
    ).length;
    const agentsAssigned = currentShift?.assignedPersonIds.length ?? 0;
    const coverageStatus =
      currentShift?.coverageStatus ??
      computeCoverage(agentsAssigned, agentsSignedIn);

    const current: EccCurrentShiftSummary = {
      shift: currentShift,
      agentsAssigned,
      agentsSignedIn: currentShift
        ? openAttendance.filter((row) =>
            currentShift.assignedPersonIds.includes(row.person_id)
          ).length
        : agentsSignedIn,
      coverageStatus,
    };

    return {
      centreId,
      asOf: nowIso(),
      managers: people.filter((p) => p.role === "ecc_manager"),
      relationshipOfficers: people.filter(
        (p) => p.role === "relationship_officer"
      ),
      agents,
      currentShift: current,
      recentAttendance,
    };
  }
}
