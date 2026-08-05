import { Badge } from "@/components/ui/Badge";
import { OCCUPANT_STATUS_LABELS, OCCUPANT_STATUS_VARIANT } from "../constants";
import type { OccupantRequestStatus } from "../types";

export function RequestStatusBadge({
  status,
}: {
  status: OccupantRequestStatus;
}) {
  return (
    <Badge variant={OCCUPANT_STATUS_VARIANT[status]}>
      {OCCUPANT_STATUS_LABELS[status]}
    </Badge>
  );
}
