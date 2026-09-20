import type { AssignablePerson } from "@/modules/users/types";
import { apiClient } from "@/services/api/ApiClient";
import { sharedRequest, WORKLOAD_TTL_MS } from "@/services/cache/sharedRequest";

const CACHE_KEY = "assignablePeople:list";

/**
 * People an operator may assign work to. Backed by /api/assignable-people
 * (ops.view) — deliberately not the users directory (users.view).
 * A failure rejects; callers must not turn it into an empty list.
 */
export const AssignablePeopleService = {
  async list(): Promise<AssignablePerson[]> {
    return sharedRequest(
      CACHE_KEY,
      async () => {
        const response = await apiClient.post<unknown>("/assignable-people", {});
        const data = response.data;
        if (!Array.isArray(data)) {
          throw new Error("People for assignment are unavailable.");
        }
        return data
          .map((row) => row as Record<string, unknown>)
          .filter((row) => typeof row.id === "string" && typeof row.name === "string")
          .map((row) => ({
            id: String(row.id),
            name: String(row.name),
            role: String(row.role ?? ""),
            facilityId: String(row.facilityId ?? ""),
          }));
      },
      { ttlMs: WORKLOAD_TTL_MS }
    );
  },
};
