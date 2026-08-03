import type { User } from "./types";

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
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function toCreateFormValues(user?: User | null) {
  return {
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    role: user?.role ?? ("technician" as const),
    specialization: user?.specialization ?? "General Operations",
    facility: user?.facility ?? "Lagos HQ",
    status: user?.status ?? ("pending" as const),
  };
}
