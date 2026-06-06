import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { ResponseException } from '@trading-model/common/middleware/response-exception';
import { isNonEmptyString, isObject } from '@trading-model/common/validation/primitives';

import { validateInstanceToken } from './helpers';
import { registry } from '../core/service-registry';

/** Extend a service instance's lease by recording a heartbeat. */
export const heartbeat: RequestHandler = catchSync(async req => {
  if (!isObject(req.body)) {
    throw ResponseException('Invalid request body').BadRequest();
  }

  const { serviceName, instanceId } = req.body as Record<string, unknown>;

  if (!isNonEmptyString(serviceName))
    throw ResponseException('serviceName is required').BadRequest();

  if (!isNonEmptyString(instanceId)) throw ResponseException('instanceId is required').BadRequest();

  validateInstanceToken(req.headers['x-instance-token'], instanceId);

  const ttl = registry.updateHeartbeat(serviceName, instanceId);

  if (!ttl) throw ResponseException('Instance not found').NotFound();

  throw ResponseException({ ttl }).Success();
});

/** Issue a new authentication token for a service instance, invalidating the previous one. */
export const rotateToken: RequestHandler = catchSync(async req => {
  if (!isObject(req.body)) throw ResponseException('Invalid request body').BadRequest();

  const { instanceId } = req.body as Record<string, unknown>;

  if (!isNonEmptyString(instanceId)) throw ResponseException('instanceId is required').BadRequest();

  validateInstanceToken(req.headers['x-instance-token'], instanceId);

  const newToken = registry.updateToken(instanceId);

  throw ResponseException({ token: newToken }).Success();
});
