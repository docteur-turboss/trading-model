import { RequestHandler } from 'express';
import { z } from 'zod';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';
import { isNonEmptyString } from '@trading-model/common/validation/primitives';

import { ServiceRegistry } from '../core/service-registry';
import { ServiceInstance } from '../core/types';

const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

const registerSchema = z.object({
  serviceName: z.string().min(1, 'serviceName is required'),
  instanceId: z.string().min(1).optional(),
  ip: z.string().regex(ipv4Regex, 'Invalid IP address'),
  port: z.number().int().min(1).max(65535, 'Invalid port'),
});

interface RegisterController {
  register: RequestHandler;
  listServices: RequestHandler;
  getServiceInstances: RequestHandler;
  getInstance: RequestHandler;
}

export function createRegisterController(registry: ServiceRegistry): RegisterController {
  /** Register a new service instance or update an existing one in the registry. */
  const register: RequestHandler = catchSync(async req => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    const { serviceName, instanceId, ip, port } = parsed.data;

    if (!registry.verifyInstanceName(serviceName))
      return sendResponse({ error: 'Invalid service name' }, 400);

    let safeInstanceId: string;

    if (instanceId !== undefined) {
      safeInstanceId = instanceId;
    } else {
      safeInstanceId = registry.generateInstanceId(serviceName, ip, port);
    }

    const instance: ServiceInstance = {
      instanceId: safeInstanceId,
      serviceName,
      ip,
      port,
      ttl: 30_000,
      protocol: 'mtls',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    const registered = registry.registerInstance(instance);

    return sendResponse(registered, 201);
  });

  const listServices: RequestHandler = catchSync(async () => {
    return sendResponse(registry.listServiceNames(), 200);
  });

  const getServiceInstances: RequestHandler = catchSync(async req => {
    const { serviceName } = req.params;

    if (!isNonEmptyString(serviceName))
      return sendResponse({ error: 'serviceName is required' }, 400);

    if (!registry.verifyInstanceName(serviceName))
      return sendResponse({ error: 'Unknown service' }, 404);

    return sendResponse(registry.getInstances(serviceName), 200);
  });

  const getInstance: RequestHandler = catchSync(async req => {
    const { serviceName, instanceId } = req.params;

    if (!isNonEmptyString(serviceName) || !isNonEmptyString(instanceId))
      return sendResponse({ error: 'Invalid route parameters' }, 400);

    const instance = registry.getInstance(serviceName, instanceId);

    if (!instance) return sendResponse({ error: 'Instance not found' }, 404);

    return sendResponse(instance, 200);
  });

  return { register, listServices, getServiceInstances, getInstance };
}
