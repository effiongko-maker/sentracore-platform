import type { User, UserStatus } from "./types";

export function getUserInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export function formatWorkload(activeWorkOrders: number) {
  const count = activeWorkOrders;
  return `${count} Active Work Order${count === 1 ? "" : "s"}`;
}

export function labelize(value: string) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatFacilityDisplay(facility: string) {
  const trimmed = String(facility ?? "").trim();
  if (!trimmed || trimmed === "-") return "—";
  return trimmed;
}

export function resolveFacilityDisplayName(
  value: string,
  facilities: Array<{ id: string; name: string }>
): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return "-";
  const match = facilities.find(
    (item) => item.id === trimmed || item.name === trimmed
  );
  return match?.name ?? trimmed;
}

export function toCreateFormValues(user?: User | null) {
  return {
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    role: user?.role ?? "",
    specialization: user?.specialization ?? "General Operations",
    facility:
      user?.facility && user.facility !== "-"
        ? user.facility
        : "",
    status: (user?.status || "active") as UserStatus,
  };
}
