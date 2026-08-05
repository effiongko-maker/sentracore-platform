import type {
  CreateMasterDataInput,
  MasterDataEntity,
  MasterDataItem,
} from "./types";

export function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function entitySingular(entity: MasterDataEntity) {
  switch (entity) {
    case "departments":
      return "Department";
    case "buildings":
      return "Building";
    case "floors":
      return "Floor";
    case "rooms":
      return "Room";
    case "vendors":
      return "Vendor";
  }
}

export function toCreateFormValues(
  entity: MasterDataEntity,
  item?: MasterDataItem | null
): CreateMasterDataInput {
  return {
    entity,
    name: item?.name ?? "",
    code: item?.code ?? "",
    status: item?.status ?? "active",
    description: item?.description ?? "",
    facilityId: item?.facilityId ?? "",
    buildingId: item?.buildingId ?? "",
    floorId: item?.floorId ?? "",
    level: item?.level ?? "",
    category: item?.category ?? "",
    contactName: item?.contactName ?? "",
    email: item?.email ?? "",
    phone: item?.phone ?? "",
  };
}
