"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCreationFacilityPrompt } from "@/hooks/useCreationFacilityPrompt";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ALL_FACILITIES } from "@/lib/access/facilityScope";
import { resolveScopedFacilityId } from "@/lib/platform/scopedFacility";

/**
 * Scoped-facility resolver for create/edit forms (facility is INHERITED — forms have no facility selector):
 *  - editing: the record's own facility (preferredId);
 *  - creating inside one facility: that workspace facility, silently;
 *  - creating from "All facilities": the user is asked ONCE per open for a target facility (authorised facilities
 *    only); the choice is local to this form and never changes the global workspace context.
 * The returned resolver is pure (safe inside useMemo / state updaters). Returns "" when no scope is established.
 */
export function useScopedFacilityResolver(options?: { open?: boolean; creating?: boolean }) {
  const { access } = useOperatingAccess();
  const prompt = useCreationFacilityPrompt();
  const open = options?.open ?? false;
  const creating = options?.creating ?? false;
  const context = access?.workspaceFacility;
  const selection = context?.selection ?? "";
  const inherited = selection && selection !== ALL_FACILITIES ? selection : "";
  const [target, setTarget] = useState("");
  const prompted = useRef(false);

  useEffect(() => {
    if (open) return;
    // Closing the form ends its creation target: the next create asks again.
    prompted.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget("");
  }, [open]);

  const needsTarget = open && creating && !inherited && !target && Boolean(context?.options.length);
  useEffect(() => {
    if (!needsTarget || prompted.current || !context) return;
    prompted.current = true;
    if (context.options.length === 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTarget(context.options[0]!.id); // nothing to choose between
      return;
    }
    prompt({ options: context.options, onPick: setTarget });
  }, [needsTarget, context, prompt]);

  const scoped = inherited || target;
  return useCallback(
    (facilities: Array<{ id: string }>, preferredId?: string | null) =>
      resolveScopedFacilityId(facilities, preferredId, scoped),
    [scoped]
  );
}
