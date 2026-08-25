"use server";

import { ActionError } from "@/lib/actions/errors";
import { getPlatformSession } from "@/lib/auth/session";
import { queryOperationalTimeline } from "./queryOperationalTimeline";
import type {
  OperationalTimelineEvent,
  OperationalTimelineQuery,
} from "./types";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function loadOperationalTimeline(
  query: Omit<OperationalTimelineQuery, "organisationId">
): Promise<OperationalTimelineEvent[]> {
  const session = await getPlatformSession();
  if (!session?.organisation) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  return queryOperationalTimeline(supabase, {
    ...query,
    organisationId: session.organisation.id,
  });
}
