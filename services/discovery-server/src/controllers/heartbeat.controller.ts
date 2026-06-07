import { RequestHandler } from 'express';
import { z } from 'zod';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { validateInstanceToken } from './helpers';
import { ServiceRegistry } from '../core/service-registry';

const heartbeatSchema = z.object({
  serviceName: z.string().min(1, 'serviceName is required'),
  instanceId: z.string().min(1, 'instanceId is required'),
});

const rotateTokenSchema = z.object({
  instanceId: z.string().min(1, 'instanceId is required'),
});

interface HeartbeatController {
  heartbeat: RequestHandler;
  rotateToken: RequestHandler;
}

export function createHeartbeatController(registry: ServiceRegistry): HeartbeatController {
  /** Extend a service instance's lease by recording a heartbeat. */
  const heartbeat: RequestHandler = catchSync(async req => {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    const { serviceName, instanceId } = parsed.data;

    validateInstanceToken(registry, req.headers['x-instance-token'], instanceId);

    const ttl = registry.updateHeartbeat(serviceName, instanceId);

    if (!ttl) return sendResponse({ error: 'Instance not found' }, 404);

    return sendResponse({ ttl }, 200);
  });

  /** Issue a new authentication token for a service instance, invalidating the previous one. */
  const rotateToken: RequestHandler = catchSync(async req => {
    const parsed = rotateTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    const { instanceId } = parsed.data;

    validateInstanceToken(registry, req.headers['x-instance-token'], instanceId);

    const newToken = registry.updateToken(instanceId);

    return sendResponse({ token: newToken }, 200);
  });

  return { heartbeat, rotateToken };
}
