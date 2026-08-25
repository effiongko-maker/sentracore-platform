import type { Asset } from "./types";

export function getAssetInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Normalize sheet/API enum tokens to lowercase underscore form. */
export function normalizeAssetToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** Date inputs use YYYY-MM-DD; sheet may return ISO — take the calendar date. */
export function toDateInputValue(value: string | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Resolve a stored facility value to the display name written on the sheet. */
export function resolveFacilityDisplayName(
  value: string,
  facilities: Array<{ id: string; name: string }>
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = facilities.find(
    (item) => item.id === trimmed || item.name === trimmed
  );
  return match?.name ?? trimmed;
}

export function toCreateFormValues(asset?: Asset | null) {
  return {
    name: asset?.name ?? "",
    category: asset?.category ?? ("other" as const),
    facility: asset?.facility ?? "",
    manufacturer: asset?.manufacturer ?? "",
    model: asset?.model ?? "",
    serialNumber: asset?.serialNumber ?? "",
    installDate: toDateInputValue(asset?.installDate),
    warrantyExpiry: toDateInputValue(asset?.warrantyExpiry),
    oemId: asset?.oemId ?? "",
    condition: asset?.condition ?? ("good" as const),
    status: asset?.status ?? ("pending" as const),
    assignedTo: asset?.assignedTo ?? "",
    criticality: asset?.criticality ?? ("unassessed" as const),
  };
}
