import { RequestHandler } from "express";
import { ServiceInstance } from "../core/types";
import { registry } from "../core/ServiceRegistry";
import { catchSync } from "cash-lib/middleware/catchError";
import { ResponseException } from "cash-lib/middleware/responseException";
import {
  isNonEmptyString,
  isObject,
  isValidIP,
  isValidPort,
} from "utils/validate";

/**
 * -------------------------
 * Service Registration
 * -------------------------
 *
 * POST /registry/register
 *
 * Registers or updates a service instance in the Service Registry.
 *
 * This endpoint is typically called:
 * - on service startup
 * - after a crash / restart
 * - during redeployments or rescheduling
 *
 * A registration creates (or refreshes) a lease associated
 * with a service instance. The instance must then periodically
 * send heartbeats to remain active.
 *
 * Security assumptions:
 * - Transport security is enforced via mTLS
 * - Instance identity is validated at the application level
 *
 * Request body:
 * {
 *   serviceName: string,
 *   instanceId?: string,
 *   ip: string,
 *   port: number
 * }
 */
export const register = catchSync((req) => {
  /**
   * Ensure the request body is a valid object.
   * Prevents malformed or unexpected payloads.
   */
  if (!isObject(req.body))
    throw ResponseException("Invalid request body").BadRequest();

  const { serviceName, instanceId, ip, port } =
    req.body as Record<string, unknown>;

  /**
   * Validate service name.
   * serviceName represents the logical identifier of the service
   * and must comply with registry naming conventions.
   */
  if (!isNonEmptyString(serviceName))
    throw ResponseException("serviceName is required").BadRequest();

  if (!registry.verifyInstanceName(serviceName))
    throw ResponseException("Invalid service name").BadRequest();

  /**
   * Validate network addressing.
   * IP and port define how this instance can be reached
   * by other services in the system.
   */
  if (!isValidIP(ip))
    throw ResponseException("Invalid IP address").BadRequest();

  if (!isValidPort(port))
    throw ResponseException("Invalid port").BadRequest();

  /**
   * Instance identifier handling.
   *
   * - If instanceId is provided, it is validated and reused
   * - Otherwise, a deterministic instanceId is generated
   *   based on service name and network coordinates
   */
  let safeInstanceId: string;

  if (instanceId !== undefined) {
    if (!isNonEmptyString(instanceId))
      throw ResponseException("Invalid instanceId").BadRequest();
    safeInstanceId = instanceId;
  } else {
    safeInstanceId = registry.generateInstanceId(serviceName, ip, port);
  }

  /**
   * Build the ServiceInstance domain object.
   * All timestamps are generated server-side to avoid
   * trusting client-provided values.
   */
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

  /**
   * Register or update the instance in the registry.
   * If the instance already exists, its lease is refreshed.
   */
  const registered = registry.registerInstance(instance);

  /**
   * Return the registered instance metadata.
   * This response can be used by the client to confirm
   * the effective registration state.
   */
  throw ResponseException(registered).OK();
}) as unknown as RequestHandler;

/**
 * -------------------------
 * List Registered Services
 * -------------------------
 *
 * GET /registry/services
 *
 * Returns the list of all known service names.
 * Useful for debugging, monitoring and admin tooling.
 */
export const listServices = catchSync(() => {
  throw ResponseException(registry.listServiceNames()).Success();
}) as unknown as RequestHandler;

/**
 * -------------------------
 * List Service Instances
 * -------------------------
 *
 * GET /registry/services/:serviceName
 *
 * Returns all active instances for a given service.
 * Dead or expired instances are excluded.
 */
export const getServiceInstances = catchSync((req) => {
  const { serviceName } = req.params;

  /**
   * Validate service name parameter.
   */
  if (!isNonEmptyString(serviceName))
    throw ResponseException("serviceName is required").BadRequest();

  if (!registry.verifyInstanceName(serviceName))
    throw ResponseException("Unknown service").NotFound();

  /**
   * Return all currently active instances.
   */
  throw ResponseException(registry.getInstances(serviceName)).Success();
}) as unknown as RequestHandler;

/**
 * -------------------------
 * Get Single Instance
 * -------------------------
 *
 * GET /registry/services/:serviceName/:instanceId
 *
 * Returns detailed information for a specific instance.
 */
export const getInstance = catchSync((req) => {
  const { serviceName, instanceId } = req.params;

  /**
   * Validate route parameters.
   */
  if (!isNonEmptyString(serviceName) || !isNonEmptyString(instanceId))
    throw ResponseException("Invalid route parameters").BadRequest();

  const instance = registry.getInstance(serviceName, instanceId);

  if (!instance)
    throw ResponseException("Instance not found").NotFound();

  throw ResponseException(instance).Success();
}) as unknown as RequestHandler;

/**
 * -------------------------
 * Registry Dump
 * -------------------------
 *
 * GET /registry/dump
 *
 * Debug / administrative endpoint.
 * Returns the full internal state of the registry.
 *
 * WARNING:
 * This endpoint SHOULD NOT be exposed publicly.
 * It must be protected (mTLS, IP filtering, admin-only).
 */
export const dump = catchSync(() => {
  throw ResponseException(registry.dump()).Success();
}) as unknown as RequestHandler;