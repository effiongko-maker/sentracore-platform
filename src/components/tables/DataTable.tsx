"use client";

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  page?: number;
  totalPages?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  page = 1,
  totalPages = 1,
  total,
  onPageChange,
  emptyIcon,
  emptyTitle = "No results found",
  emptyDescription = "Try adjusting your search or filters.",
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("sc-table-surface", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn("px-4 py-3", column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton_${index}`}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3.5">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100/90" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-6">
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDescription}
                    className="border-0 bg-transparent py-10"
                  />
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-4 py-3.5 text-sm text-foreground",
                        column.className
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {onPageChange ? (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--sc-rule)] px-4 py-3">
          <p className="text-sm text-muted">
            {total !== undefined
              ? `${total} result${total === 1 ? "" : "s"}`
              : "Results"}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
