import type { PaginatedResult } from "@/types";

/** Walk a paginated domain list until all rows are loaded. */
export async function loadAllPages<T>(
  listPage: (page: number, pageSize: number) => Promise<PaginatedResult<T>>,
  pageSize = 100
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await listPage(page, pageSize);
    rows.push(...result.data);
    totalPages = Math.max(1, result.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return rows;
}
