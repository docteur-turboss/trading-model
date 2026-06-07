import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';
import {
  isNonEmptyString,
  isObject,
  isValidIP,
  isValidPort,
} from '@trading-model/common/validation/primitives';

import { ServiceRegistry } from '../core/service-registry';
import { ServiceInstance } from '../core/types';

interface RegisterController {
  register: RequestHandler;
  listServices: RequestHandler;
  getServiceInstances: RequestHandler;
  getInstance: RequestHandler;
}

export function createRegisterController(registry: ServiceRegistry): RegisterController {
  /** Register a new service instance or update an existing one in the registry. */
  const register: RequestHandler = catchSync(async req => {
    if (!isObject(req.body)) return sendResponse({ error: 'Invalid request body' }, 400);

    const { serviceName, instanceId, ip, port } = req.body as Record<string, unknown>;

    if (!isNonEmptyString(serviceName))
      return sendResponse({ error: 'serviceName is required' }, 400);

    if (!registry.verifyInstanceName(serviceName))
      return sendResponse({ error: 'Invalid service name' }, 400);

    if (!isValidIP(ip)) return sendResponse({ error: 'Invalid IP address' }, 400);

    if (!isValidPort(port)) return sendResponse({ error: 'Invalid port' }, 400);

    let safeInstanceId: string;

    if (instanceId !== undefined) {
      if (!isNonEmptyString(instanceId)) return sendResponse({ error: 'Invalid instanceId' }, 400);
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

  /** Return the list of all registered service names. */
  const listServices: RequestHandler = catchSync(async () => {
    return sendResponse(registry.listServiceNames(), 200);
  });

  /** Return all registered instances for a given service name. */
  const getServiceInstances: RequestHandler = catchSync(async req => {
    const { serviceName } = req.params;

    if (!isNonEmptyString(serviceName))
      return sendResponse({ error: 'serviceName is required' }, 400);

    if (!registry.verifyInstanceName(serviceName))
      return sendResponse({ error: 'Unknown service' }, 404);

    return sendResponse(registry.getInstances(serviceName), 200);
  });

  /** Return metadata for a specific service instance by service name and instance ID. */
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
