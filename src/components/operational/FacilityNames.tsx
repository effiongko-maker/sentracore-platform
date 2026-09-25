"use client";

import { useFacilityName } from "@/hooks/useEntityLabel";

function FacilityName({ id }: { id: string }) {
  return <>{useFacilityName(id) || id}</>;
}

/** Every facility a record covers, primary first — a multi-facility record reads "NCC Annex + CSIRT". */
export function FacilityNames({ ids, fallback = "—" }: { ids: readonly string[] | undefined; fallback?: string }) {
  const list = (ids ?? []).filter(Boolean);
  if (list.length === 0) return <>{fallback}</>;
  return (
    <>
      {list.map((id, index) => (
        <span key={id}>
          {index > 0 ? " + " : ""}
          <FacilityName id={id} />
        </span>
      ))}
    </>
  );
}
