import { registry } from "../core/ServiceRegistry";
import { catchSync } from "@trading-model/common/middleware/catchError";
import { ResponseException } from "@trading-model/common/middleware/responseException";
import { isNonEmptyString, isObject } from "@trading-model/common/validation/primitives";
import { asHandler, validateInstanceToken } from "./helpers";

export const heartbeat = asHandler(catchSync(async (req) => {
  if (!isObject(req.body)) {
    throw ResponseException("Invalid request body").BadRequest();
  }

  const { serviceName, instanceId } = req.body as Record<string, unknown>;

  if (!isNonEmptyString(serviceName))
    throw ResponseException("serviceName is required").BadRequest();

  if (!isNonEmptyString(instanceId))
    throw ResponseException("instanceId is required").BadRequest();

  validateInstanceToken(req.headers["x-instance-token"], instanceId);

  const ttl = registry.updateHeartbeat(serviceName, instanceId);

  if (!ttl)
    throw ResponseException("Instance not found").NotFound();

  throw ResponseException({ ttl }).Success();
}));

export const rotateToken = asHandler(catchSync(async (req) => {
  if (!isObject(req.body))
    throw ResponseException("Invalid request body").BadRequest();

  const { instanceId } = req.body as Record<string, unknown>;

  if (!isNonEmptyString(instanceId))
    throw ResponseException("instanceId is required").BadRequest();

  validateInstanceToken(req.headers["x-instance-token"], instanceId);

  const newToken = registry.updateToken(instanceId);

  throw ResponseException({ token: newToken }).Success();
}));
