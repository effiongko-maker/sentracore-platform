"use client";

import { Building2 } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { AuthorisedFacility } from "@/lib/access/facilityScope";

type PromptRequest = {
  options: AuthorisedFacility[];
  onPick: (facilityId: string) => void;
};

const CreationFacilityPromptContext = createContext<(request: PromptRequest) => void>(() => {});

/**
 * "Choose a facility to create this in" — shown when a facility-specific create form opens while the workspace is on
 * "All facilities". The choice becomes that ONE form's inherited facility; it never changes the global workspace
 * facility context. Forms themselves keep no facility selector.
 */
export function CreationFacilityPromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const ask = useCallback((next: PromptRequest) => setRequest(next), []);

  return (
    <CreationFacilityPromptContext.Provider value={ask}>
      {children}
      {request ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sc-create-facility-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-sc-lg">
            <p id="sc-create-facility-title" className="text-sm font-semibold text-foreground">
              Choose a facility
            </p>
            <p className="mt-1 text-xs text-muted">
              You are viewing All facilities. Choose where this record belongs — your workspace stays on All facilities.
            </p>
            <div className="mt-4 grid gap-2">
              {request.options.map((facility) => (
                <button
                  key={facility.id}
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-slate-50"
                  onClick={() => {
                    request.onPick(facility.id);
                    setRequest(null);
                  }}
                >
                  <Building2 className="h-4 w-4 text-muted" aria-hidden />
                  {facility.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-xl px-3 py-2 text-xs font-medium text-muted hover:text-foreground"
              onClick={() => setRequest(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </CreationFacilityPromptContext.Provider>
  );
}

export function useCreationFacilityPrompt() {
  return useContext(CreationFacilityPromptContext);
}
