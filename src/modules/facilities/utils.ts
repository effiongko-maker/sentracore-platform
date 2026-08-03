import type { Facility } from "./types";

export function getFacilityInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export function labelize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function toCreateFormValues(facility?: Facility | null) {
  return {
    name: facility?.name ?? "",
    code: facility?.code ?? "",
    location: facility?.location ?? "Lagos, Nigeria",
    type: facility?.type ?? ("office" as const),
    manager: facility?.manager ?? "",
    status: facility?.status ?? ("pending" as const),
    description: facility?.description ?? "",
  };
}
