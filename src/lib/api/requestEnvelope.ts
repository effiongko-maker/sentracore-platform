/**
 * Body of the `/api/*` compatibility routes: `{ resource, action, payload }`.
 * The browser clients keep this envelope; every route is served from
 * Supabase/Postgres by a server-only domain service.
 */
export type ApiRequestEnvelope = {
  resource?: string;
  action?: string;
  payload?: unknown;
  requestId?: string;
};
