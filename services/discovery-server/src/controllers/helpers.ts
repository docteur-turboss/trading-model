import { RequestHandler } from 'express';
import { isNonEmptyString } from '@trading-model/common/validation/primitives';
import { ResponseException } from '@trading-model/common/middleware/response-exception';
import { registry } from '../core/service-registry';

/** Cast a controller function to an Express RequestHandler without type inference. */
export function asHandler(fn: (...args: unknown[]) => unknown): RequestHandler {
  return fn as unknown as RequestHandler;
}

/** Validate the x-instance-token header against the stored token for a given instance. */
export function validateInstanceToken(tokenHeader: unknown, instanceId: string): void {
  if (!isNonEmptyString(tokenHeader))
    throw ResponseException('Missing or invalid instance token').Unauthorized();

  if (!registry.validInstanceToken(tokenHeader, instanceId))
    throw ResponseException('Invalid instance token').Unauthorized();
}
