"use client";

import { useEffect, useState } from "react";
import { FacilityService } from "@/services/facilities/FacilityService";
import type { Facility } from "@/modules/facilities/types";
import { getOccupantActor } from "../context/OccupantSession";

export function useOccupantFacilities() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const actor = getOccupantActor();

    FacilityService.listFacilities({ page: 1, pageSize: 200, status: "all" })
      .then((page) => {
        if (cancelled) return;
        const allowed = actor.facilityIds?.length
          ? page.data.filter((f) => actor.facilityIds!.includes(f.id))
          : page.data;
        setFacilities(allowed.filter((f) => f.id && f.name));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFacilities([]);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load facilities right now."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { facilities, loading, error };
}
