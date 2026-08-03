/**
 * Shared helper: walk paginated domain list APIs into an id → name map.
 * Avoids N+1 getById calls and reuses the live getAll path.
 */

export interface DirectoryPage<T> {
  data: T[];
  page: number;
  totalPages: number;
}

export async function loadDirectoryPages<T>(options: {
  pageSize?: number;
  listPage: (page: number, pageSize: number) => Promise<DirectoryPage<T>>;
  getId: (row: T) => string;
  getName: (row: T) => string;
}): Promise<Map<string, string>> {
  const pageSize = options.pageSize ?? 100;
  const map = new Map<string, string>();
  let page = 1;
  let totalPages = 1;

  do {
    const result = await options.listPage(page, pageSize);
    totalPages = Math.max(1, result.totalPages || 1);

    for (const row of result.data) {
      const id = String(options.getId(row) ?? "").trim();
      if (!id) continue;
      const name = String(options.getName(row) ?? "").trim();
      map.set(id, name || id);
    }

    page += 1;
  } while (page <= totalPages);

  return map;
}
