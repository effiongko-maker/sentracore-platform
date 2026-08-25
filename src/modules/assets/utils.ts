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

export function toCreateFormValues(asset?: Asset | null) {
  return {
    assetTag: asset?.assetTag ?? "",
    name: asset?.name ?? "",
    category: asset?.category ?? ("other" as const),
    facility: asset?.facility ?? "",
    manufacturer: asset?.manufacturer ?? "",
    model: asset?.model ?? "",
    serialNumber: asset?.serialNumber ?? "",
    purchaseDate: asset?.purchaseDate ?? "",
    warrantyExpiry: asset?.warrantyExpiry ?? "",
    condition: asset?.condition ?? ("good" as const),
    status: asset?.status ?? ("pending" as const),
    assignedTo: asset?.assignedTo ?? "",
    criticality: asset?.criticality ?? ("unassessed" as const),
    description: asset?.description ?? "",
  };
}
