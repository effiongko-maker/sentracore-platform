import { NextResponse } from "next/server";
import { gateApiCapability } from "@/lib/access/gateApi";
import {
  applyAuthorityToPayload,
  emitProtectedActionAudit,
  extractProtectedProof,
  gateProtectedActionOrResponse,
} from "@/lib/access/gateProtectedAction";
import { isWriteAction } from "@/lib/access/server";
import type { AccessCapability } from "@/lib/access/capabilities";
import type { ProtectedActionId } from "@/lib/access/protectedActions";
import {
  postToAppsScript,
  type AppsScriptProxyBody,
} from "@/services/api/appsScriptProxy";

/**
 * Finance proxy with read (finance.view) + write gates and optional
 * protected-action authorization. Visibility ≠ mutation: reads do not
 * grant writeCapability.
 */
export async function postFinanceProxyWithProtection(options: {
  request: Request;
  resource: string;
  logPrefix: string;
  writeCapability: AccessCapability;
  /** Capability required for non-write actions (default finance.view). */
  readCapability?: AccessCapability;
  /**
   * When the Apps Script action is this verb, require the given protected action.
   * e.g. authorization update → finance.authorization.revise
   */
  requireProtectedForActions?: Partial<Record<string, ProtectedActionId>>;
}): Promise<NextResponse> {
  try {
    let body: AppsScriptProxyBody = {};
    try {
      body = (await options.request.json()) as AppsScriptProxyBody;
    } catch {
      body = {};
    }

    const action = String(body.action ?? "getAll");
    let payload = body.payload;

    if (isWriteAction(action)) {
      const gate = await gateApiCapability(options.writeCapability);
      if (!gate.ok) return gate.response;

      const extracted = extractProtectedProof(payload);
      const requiredProtected =
        options.requireProtectedForActions?.[action] ?? null;
      const protectedActionId =
        extracted.actionId ?? requiredProtected ?? null;

      if (requiredProtected && extracted.actionId && extracted.actionId !== requiredProtected) {
        return NextResponse.json(
          {
            success: false,
            message: `This mutation requires protected action ${requiredProtected}.`,
            data: null,
          },
          { status: 403 }
        );
      }

      if (requiredProtected || extracted.actionId) {
        const actionId = (extracted.actionId ?? requiredProtected)!;
        if (requiredProtected && actionId !== requiredProtected) {
          return NextResponse.json(
            {
              success: false,
              message: `Protected action mismatch.`,
              data: null,
            },
            { status: 403 }
          );
        }
        const protectedGate = await gateProtectedActionOrResponse(
          actionId,
          extracted.stepUpPassword
        );
        if (!protectedGate.ok) return protectedGate.response;

        payload = applyAuthorityToPayload(
          extracted.sanitizedPayload,
          protectedGate.result
        );

        const entityId = String(
          (payload as Record<string, unknown>).costId ??
            (payload as Record<string, unknown>).submissionId ??
            (payload as Record<string, unknown>).authorizationId ??
            (payload as Record<string, unknown>).paymentId ??
            (payload as Record<string, unknown>).id ??
            ""
        );

        const data = await postToAppsScript(
          { ...body, payload },
          { resource: options.resource, action: "getAll" },
          options.logPrefix
        );

        await emitProtectedActionAudit({
          auth: protectedGate.result,
          entityId: entityId || actionId,
          clientRequestId: extracted.clientRequestId,
          after: {
            resource: options.resource,
            action,
          },
        });

        return NextResponse.json(data, {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        });
      }

      payload = extracted.sanitizedPayload;
    } else {
      const readCapability = options.readCapability ?? "finance.view";
      const readGate = await gateApiCapability(readCapability);
      if (!readGate.ok) return readGate.response;
    }

    const data = await postToAppsScript(
      { ...body, payload },
      { resource: options.resource, action: "getAll" },
      options.logPrefix
    );

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(`[${options.logPrefix}] proxy error:`, error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach Apps Script.",
        data: null,
      },
      { status: 502 }
    );
  }
}
