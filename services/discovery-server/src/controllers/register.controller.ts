import { catchSync } from '@trading-model/common/middleware/catch-error';
import { ResponseException } from '@trading-model/common/middleware/response-exception';
import {
  isNonEmptyString,
  isObject,
  isValidIP,
  isValidPort,
} from '@trading-model/common/validation/primitives';

import { asHandler } from './helpers';
import { registry } from '../core/service-registry';
import { ServiceInstance } from '../core/types';

/** Register a new service instance or update an existing one in the registry. */
export const register = asHandler(
  catchSync(async req => {
    if (!isObject(req.body)) throw ResponseException('Invalid request body').BadRequest();

    const { serviceName, instanceId, ip, port } = req.body as Record<string, unknown>;

    if (!isNonEmptyString(serviceName))
      throw ResponseException('serviceName is required').BadRequest();

    if (!registry.verifyInstanceName(serviceName))
      throw ResponseException('Invalid service name').BadRequest();

    if (!isValidIP(ip)) throw ResponseException('Invalid IP address').BadRequest();

    if (!isValidPort(port)) throw ResponseException('Invalid port').BadRequest();

    let safeInstanceId: string;

    if (instanceId !== undefined) {
      if (!isNonEmptyString(instanceId)) throw ResponseException('Invalid instanceId').BadRequest();
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

    throw ResponseException(registered).OK();
  })
);

/** Return the list of all registered service names. */
export const listServices = asHandler(
  catchSync(async () => {
    throw ResponseException(registry.listServiceNames()).Success();
  })
);

/** Return all registered instances for a given service name. */
export const getServiceInstances = asHandler(
  catchSync(async req => {
    const { serviceName } = req.params;

    if (!isNonEmptyString(serviceName))
      throw ResponseException('serviceName is required').BadRequest();

    if (!registry.verifyInstanceName(serviceName))
      throw ResponseException('Unknown service').NotFound();

    throw ResponseException(registry.getInstances(serviceName)).Success();
  })
);

/** Return metadata for a specific service instance by service name and instance ID. */
export const getInstance = asHandler(
  catchSync(async req => {
    const { serviceName, instanceId } = req.params;

    if (!isNonEmptyString(serviceName) || !isNonEmptyString(instanceId))
      throw ResponseException('Invalid route parameters').BadRequest();

    const instance = registry.getInstance(serviceName, instanceId);

    if (!instance) throw ResponseException('Instance not found').NotFound();

    throw ResponseException(instance).Success();
  })
);
