/**
 * Organisation-local operational time.
 *
 * The organisation's IANA timezone (organisations.timezone) is the ONLY authority
 * for what "today" means operationally. It is never inferred from the browser,
 * the server machine, a facility, or a global constant. An unknown or invalid
 * timezone is an explicit error — unknown timezone is not UTC.
 *
 * Instants (created_at, recorded_at, …) stay UTC. Only calendar-date semantics
 * (e.g. an ECC reporting date) use this helper.
 */

export class OrganisationTimeZoneError extends Error {
  readonly code = "ORGANISATION_TIMEZONE_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "OrganisationTimeZoneError";
  }
}

/** Returns the identifier when it is a valid IANA timezone; throws otherwise. */
export function assertIanaTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OrganisationTimeZoneError(
      "The organisation has no timezone configured."
    );
  }
  const zone = value.trim();
  try {
    // Throws RangeError for anything the runtime's IANA database does not know.
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(0));
  } catch {
    throw new OrganisationTimeZoneError(
      `"${zone}" is not a valid IANA timezone for this organisation.`
    );
  }
  return zone;
}

/** Authoritative timezone from organisation context; explicit failure when absent/invalid. */
export function requireOrganisationTimeZone(
  organisation: { timezone?: string | null } | null | undefined
): string {
  return assertIanaTimeZone(organisation?.timezone ?? null);
}

/** YYYY-MM-DD calendar date of `instant` in the organisation's timezone. */
export function organisationLocalDate(
  instant: Date | string | number,
  timeZone: string
): string {
  const zone = assertIanaTimeZone(timeZone);
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new OrganisationTimeZoneError("Invalid instant.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  if (!year || !month || !day) {
    throw new OrganisationTimeZoneError("Unable to resolve the organisation-local date.");
  }
  return `${year}-${month}-${day}`;
}

/** Hour (0–23) of `instant` in the organisation's timezone. */
export function organisationLocalHour(
  instant: Date | string | number,
  timeZone: string
): number {
  const zone = assertIanaTimeZone(timeZone);
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(instant instanceof Date ? instant : new Date(instant));
  return Number(hour);
}
