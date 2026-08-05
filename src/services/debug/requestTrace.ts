/**
 * Temporary hang-investigation helper — now a transparent passthrough.
 * Kept so call sites do not need a wider refactor during stabilization.
 */

export function traceRequest<T>(
  _name: string,
  task: () => Promise<T>
): Promise<T> {
  return task();
}

export function getTraceSnapshot() {
  return {};
}
