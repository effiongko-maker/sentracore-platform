import type { PaginatedResult } from "@/types";
import type { User, UserListParams, UserStatus } from "@/modules/users/types";

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseUserSeq(id: string): number {
  const match = id.match(/USR-(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function compareUserId(a: User, b: User): number {
  const aSeq = parseUserSeq(a.id);
  const bSeq = parseUserSeq(b.id);
  if (aSeq === bSeq) return a.id.localeCompare(b.id);
  return aSeq - bSeq;
}

export function sortUsersNewestFirst(users: User[]): User[] {
  return [...users].sort((a, b) => compareUserId(b, a));
}

export function userMatchesSearch(user: User, search: string | undefined): boolean {
  const q = normalize(search);
  if (!q) return true;

  const haystack = [
    user.name,
    user.email,
    user.phone,
    user.role,
    user.specialization,
    user.facility,
    user.id,
  ]
    .map(normalize)
    .join(" ");

  return haystack.includes(q);
}

export function userMatchesFacility(
  userFacility: string,
  facilityFilter: string | "all" | undefined,
  facilityNameById: Map<string, string>
): boolean {
  if (!facilityFilter || facilityFilter === "all") return true;
  const stored = String(userFacility ?? "").trim();
  if (!stored || stored === "-") return false;
  if (normalize(stored) === normalize(facilityFilter)) return true;

  const filterName = facilityNameById.get(facilityFilter);
  if (filterName && normalize(stored) === normalize(filterName)) return true;

  for (const [id, name] of facilityNameById) {
    if (
      normalize(name) === normalize(facilityFilter) &&
      (normalize(stored) === normalize(id) || normalize(stored) === normalize(name))
    ) {
      return true;
    }
  }
  return false;
}

export function applyUserListFilters(
  users: User[],
  params: UserListParams,
  facilityNameById: Map<string, string> = new Map()
): User[] {
  const status = params.status;
  const role = params.role;
  const facility = params.facility;

  return users.filter((user) => {
    if (!userMatchesSearch(user, params.search)) return false;

    if (status && status !== "all") {
      if (normalize(user.status) !== normalize(status)) return false;
    }

    if (role && role !== "all") {
      if (normalize(user.role) !== normalize(role)) return false;
    }

    if (!userMatchesFacility(user.facility, facility, facilityNameById)) {
      return false;
    }

    return true;
  });
}

export function paginateUsers(
  users: User[],
  params: UserListParams
): PaginatedResult<User> {
  const pageSize = Math.max(1, Number(params.pageSize ?? 8));
  let page = Math.max(1, Number(params.page ?? 1));
  const total = users.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * pageSize;

  return {
    data: users.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export function queryUsersPage(
  users: User[],
  params: UserListParams = {},
  facilityNameById: Map<string, string> = new Map()
): PaginatedResult<User> {
  const filtered = applyUserListFilters(users, params, facilityNameById);
  const sorted = sortUsersNewestFirst(filtered);
  return paginateUsers(sorted, params);
}

export function distinctUserRoles(users: User[]): string[] {
  const roles = new Set<string>();
  for (const user of users) {
    const role = String(user.role ?? "").trim();
    if (role) roles.add(role);
  }
  return Array.from(roles).sort((a, b) => a.localeCompare(b));
}

export function distinctUserStatuses(users: User[]): UserStatus[] {
  const statuses = new Set<UserStatus>();
  for (const user of users) {
    if (user.status) statuses.add(user.status);
  }
  return Array.from(statuses).sort();
}
