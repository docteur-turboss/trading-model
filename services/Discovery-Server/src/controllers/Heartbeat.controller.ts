import { RequestHandler } from "express";
import { registry } from "../core/ServiceRegistry";
import { catchSync } from "cash-lib/middleware/catchError";
import { isNonEmptyString, isObject } from "../utils/validate";
import { ResponseException } from "cash-lib/middleware/responseException";

/**
 * -------------------------
 * Heartbeat Endpoint
 * -------------------------
 *
 * POST /registry/heartbeat
 *
 * Purpose:
 * Keeps a service instance marked as alive in the Service Registry.
 *
 * This endpoint is called periodically by each running service instance.
 * If heartbeats stop, the LeaseManager will eventually evict the instance.
 *
 * Security model:
 * - Transport security is ensured via mTLS
 * - Application-level authentication is enforced using an instance token
 *
 * Required body:
 * {
 *   serviceName: string,
 *   instanceId: string
 * }
 *
 * Required headers:
 * - x-instance-token: string
 *
 * Response:
 * - 200 OK with remaining TTL
 * - 401 if token is missing or invalid
 * - 404 if the instance is unknown
 */
export const heartbeat = catchSync(async (req) => {
  /**
   * Validate request body structure.
   * Rejects non-object payloads early to prevent undefined behavior.
   */
  if (!isObject(req.body)) {
    throw ResponseException("Invalid request body").BadRequest();
  }

  const { serviceName, instanceId } = req.body as Record<string, unknown>;

  /**
   * Validate mandatory identifiers.
   * serviceName identifies the logical service
   * instanceId uniquely identifies a single running instance
   */
  if (!isNonEmptyString(serviceName))
    throw ResponseException("serviceName is required").BadRequest();

  if (!isNonEmptyString(instanceId))
    throw ResponseException("instanceId is required").BadRequest();

  /**
   * Retrieve and validate instance token from headers.
   * This token prevents unauthorized services from spoofing heartbeats.
   */
  const tokenHeader = req.headers["x-instance-token"];

  if (!isNonEmptyString(tokenHeader))
    throw ResponseException("Missing or invalid instance token").Unauthorized();

  if (!registry.validInstanceToken(tokenHeader, instanceId))
    throw ResponseException("Invalid instance token").Unauthorized();

  /**
   * Update the heartbeat timestamp and extend the lease TTL.
   * If the instance does not exist, the registry returns null.
   */
  const ttl = registry.updateHeartbeat(serviceName, instanceId);

  if (!ttl)
    throw ResponseException("Instance not found").NotFound();

  /**
   * Respond with the remaining TTL.
   * Clients can use this information for observability or debugging.
   */
  throw ResponseException({ ttl }).Success();
}) as unknown as RequestHandler;

/**
 * -------------------------
 * Instance Token Rotation
 * -------------------------
 *
 * POST /registry/token/rotate
 *
 * Purpose:
 * Rotates the instance authentication token without re-registering
 * the service instance.
 *
 * Use cases:
 * - token compromise
 * - scheduled credential rotation
 * - short-lived credentials enforcement
 *
 * Required body:
 * {
 *   instanceId: string
 * }
 *
 * Required headers:
 * - x-instance-token: string (current valid token)
 */
export const rotateToken = catchSync(async (req) => {
  /**
   * Validate request body.
   */
  if (!isObject(req.body))
    throw ResponseException("Invalid request body").BadRequest();

  const { instanceId } = req.body as Record<string, unknown>;

  /**
   * instanceId is mandatory to identify which instance
   * is requesting a token rotation.
   */
  if (!isNonEmptyString(instanceId))
    throw ResponseException("instanceId is required").BadRequest();

  /**
   * Authenticate the request using the current instance token.
   */
  const tokenHeader = req.headers["x-instance-token"];

  if (!isNonEmptyString(tokenHeader))
    throw ResponseException("Missing or invalid instance token").Unauthorized();

  if (!registry.validInstanceToken(tokenHeader, instanceId))
    throw ResponseException("Invalid instance token").Unauthorized();

  /**
   * Generate and persist a new token for the instance.
   * The old token is immediately invalidated.
   */
  const newToken = registry.updateToken(instanceId);

  /**
   * Return the newly issued token.
   * The client is responsible for updating its configuration
   * and using this token for subsequent requests.
   */
  throw ResponseException({ token: newToken }).Success();
}) as unknown as RequestHandler;