export { RequestsPage } from "./components/RequestsPage";
export { RequestService } from "./services/RequestService";
export { useRequests } from "./hooks/useRequests";
export type {
  CreateRequestInput,
  RequestListParams,
  RequestModalState,
  RequestRecord,
  RequestStatus,
  RequestType,
  UpdateRequestInput,
} from "./types";
export {
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  REQUESTS_PAGE_SIZE,
} from "./constants";

// Server actions live in ./actions/treatRequest ("use server").
// Do NOT re-export them from this barrel — client consumers of RequestsPage
// would pull executeAction → next/headers into the browser graph.
