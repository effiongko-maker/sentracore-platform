/**
 * Client→API proof fields for protected finance mutations.
 * Password never persists; API strips it before Apps Script.
 */

import {
  PROTECTED_PROOF_KEYS,
  type ProtectedActionId,
} from "@/lib/access/protectedActions";

export type ProtectedMutationProof = {
  actionId: ProtectedActionId;
  stepUpPassword?: string;
  clientRequestId?: string;
};

export function mergeProtectedProof(
  payload: Record<string, unknown>,
  proof?: ProtectedMutationProof | null
): Record<string, unknown> {
  if (!proof) return payload;
  return {
    ...payload,
    [PROTECTED_PROOF_KEYS.action]: proof.actionId,
    ...(proof.stepUpPassword
      ? { [PROTECTED_PROOF_KEYS.stepUpPassword]: proof.stepUpPassword }
      : {}),
    ...(proof.clientRequestId
      ? { [PROTECTED_PROOF_KEYS.clientRequestId]: proof.clientRequestId }
      : {}),
  };
}
