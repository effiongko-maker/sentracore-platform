export function ResultContext({
  text,
}: {
  text: string | null;
}) {
  if (!text) return null;
  return <p className="op-result-context">{text}</p>;
}

export function buildResultContext({
  noun,
  nounPlural,
  total,
  filtered,
  pageSize,
}: {
  noun: string;
  nounPlural: string;
  total: number;
  filtered: boolean;
  pageSize: number;
}): string {
  const label = total === 1 ? noun : nounPlural;
  if (!filtered) {
    return `${total} ${label}`;
  }
  if (total <= pageSize) {
    return `${total} ${label} matching your filters`;
  }
  return `Showing ${Math.min(pageSize, total)} of ${total} ${label}`;
}
