/**
 * Temporary hang-investigation counters.
 * Logs start / finish / duration / running totals.
 */

type Counters = {
  started: number;
  finished: number;
  inFlight: number;
};

const counters = new Map<string, Counters>();

function bucket(name: string): Counters {
  let entry = counters.get(name);
  if (!entry) {
    entry = { started: 0, finished: 0, inFlight: 0 };
    counters.set(name, entry);
  }
  return entry;
}

export function traceRequest<T>(name: string, task: () => Promise<T>): Promise<T> {
  const stats = bucket(name);
  const id = ++stats.started;
  stats.inFlight += 1;
  const started = performance.now();
  console.log(
    `[hang] ${name} #${id} START (inFlight=${stats.inFlight} totalStarted=${stats.started})`
  );

  return task()
    .then((value) => {
      const ms = Math.round(performance.now() - started);
      stats.finished += 1;
      stats.inFlight = Math.max(0, stats.inFlight - 1);
      console.log(
        `[hang] ${name} #${id} FINISH ${ms}ms (inFlight=${stats.inFlight} totalFinished=${stats.finished})`
      );
      return value;
    })
    .catch((error) => {
      const ms = Math.round(performance.now() - started);
      stats.finished += 1;
      stats.inFlight = Math.max(0, stats.inFlight - 1);
      console.log(
        `[hang] ${name} #${id} FAIL ${ms}ms (inFlight=${stats.inFlight} totalFinished=${stats.finished})`,
        error instanceof Error ? error.message : error
      );
      throw error;
    });
}

export function getTraceSnapshot() {
  return Object.fromEntries(
    Array.from(counters.entries()).map(([name, value]) => [name, { ...value }])
  );
}
