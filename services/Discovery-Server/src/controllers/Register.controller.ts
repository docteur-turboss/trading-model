import { ServiceInstance } from "../core/types";
import { registry } from "../core/ServiceRegistry";
import { catchSync } from "@trading-model/common/middleware/catchError";
import { ResponseException } from "@trading-model/common/middleware/responseException";
import {
  isNonEmptyString,
  isObject,
  isValidIP,
  isValidPort,
} from "@trading-model/common/validation/primitives";
import { asHandler } from "./helpers";

export const register = asHandler(catchSync(async (req) => {
  if (!isObject(req.body))
    throw ResponseException("Invalid request body").BadRequest();

  const { serviceName, instanceId, ip, port } =
    req.body as Record<string, unknown>;

  if (!isNonEmptyString(serviceName))
    throw ResponseException("serviceName is required").BadRequest();

  if (!registry.verifyInstanceName(serviceName))
    throw ResponseException("Invalid service name").BadRequest();

  if (!isValidIP(ip))
    throw ResponseException("Invalid IP address").BadRequest();

  if (!isValidPort(port))
    throw ResponseException("Invalid port").BadRequest();

  let safeInstanceId: string;

  if (instanceId !== undefined) {
    if (!isNonEmptyString(instanceId))
      throw ResponseException("Invalid instanceId").BadRequest();
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
    protocol: "mtls",
    registeredAt: Date.now(),
    lastHeartbeat: Date.now(),
  };

  const registered = registry.registerInstance(instance);

  throw ResponseException(registered).OK();
}));

export const listServices = asHandler(catchSync(async () => {
  throw ResponseException(registry.listServiceNames()).Success();
}));

export const getServiceInstances = asHandler(catchSync(async (req) => {
  const { serviceName } = req.params;

  if (!isNonEmptyString(serviceName))
    throw ResponseException("serviceName is required").BadRequest();

  if (!registry.verifyInstanceName(serviceName))
    throw ResponseException("Unknown service").NotFound();

  throw ResponseException(registry.getInstances(serviceName)).Success();
}));

export const getInstance = asHandler(catchSync(async (req) => {
  const { serviceName, instanceId } = req.params;

  if (!isNonEmptyString(serviceName) || !isNonEmptyString(instanceId))
    throw ResponseException("Invalid route parameters").BadRequest();

  const instance = registry.getInstance(serviceName, instanceId);

  if (!instance)
    throw ResponseException("Instance not found").NotFound();

  throw ResponseException(instance).Success();
}));

export const dump = asHandler(catchSync(async () => {
  throw ResponseException(registry.dump()).Success();
}));
