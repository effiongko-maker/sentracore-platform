"use client";

import { useEffect, useState } from "react";

/** Read `?id=` once on the client for deep-linking into existing view modals. */
export function useQueryRecordId(param = "id"): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const value = new URLSearchParams(window.location.search)
        .get(param)
        ?.trim();
      setId(value || null);
    } catch {
      setId(null);
    }
  }, [param]);

  return id;
}
