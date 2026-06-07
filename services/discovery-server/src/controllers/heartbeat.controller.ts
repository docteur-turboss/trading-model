import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';
import { isNonEmptyString, isObject } from '@trading-model/common/validation/primitives';

import { validateInstanceToken } from './helpers';
import { ServiceRegistry } from '../core/service-registry';

interface HeartbeatController {
  heartbeat: RequestHandler;
  rotateToken: RequestHandler;
}

export function createHeartbeatController(registry: ServiceRegistry): HeartbeatController {
  /** Extend a service instance's lease by recording a heartbeat. */
  const heartbeat: RequestHandler = catchSync(async req => {
    if (!isObject(req.body)) {
      return sendResponse({ error: 'Invalid request body' }, 400);
    }

    const { serviceName, instanceId } = req.body as Record<string, unknown>;

    if (!isNonEmptyString(serviceName))
      return sendResponse({ error: 'serviceName is required' }, 400);

    if (!isNonEmptyString(instanceId))
      return sendResponse({ error: 'instanceId is required' }, 400);

    validateInstanceToken(registry, req.headers['x-instance-token'], instanceId);

    const ttl = registry.updateHeartbeat(serviceName, instanceId);

    if (!ttl) return sendResponse({ error: 'Instance not found' }, 404);

    return sendResponse({ ttl }, 200);
  });

  /** Issue a new authentication token for a service instance, invalidating the previous one. */
  const rotateToken: RequestHandler = catchSync(async req => {
    if (!isObject(req.body)) return sendResponse({ error: 'Invalid request body' }, 400);

    const { instanceId } = req.body as Record<string, unknown>;

    if (!isNonEmptyString(instanceId))
      return sendResponse({ error: 'instanceId is required' }, 400);

    validateInstanceToken(registry, req.headers['x-instance-token'], instanceId);

    const newToken = registry.updateToken(instanceId);

    return sendResponse({ token: newToken }, 200);
  });

  return { heartbeat, rotateToken };
}
