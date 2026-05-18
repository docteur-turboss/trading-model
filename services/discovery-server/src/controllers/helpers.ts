import { RequestHandler } from "express";
import { isNonEmptyString } from "@trading-model/common/validation/primitives";
import { ResponseException } from "@trading-model/common/middleware/responseException";
import { registry } from "../core/ServiceRegistry";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function asHandler(fn: (...args: any[]) => any): RequestHandler {
  return fn as unknown as RequestHandler;
}

export function validateInstanceToken(
  tokenHeader: unknown,
  instanceId: string
): void {
  if (!isNonEmptyString(tokenHeader))
    throw ResponseException("Missing or invalid instance token").Unauthorized();

  if (!registry.validInstanceToken(tokenHeader, instanceId))
    throw ResponseException("Invalid instance token").Unauthorized();
}
