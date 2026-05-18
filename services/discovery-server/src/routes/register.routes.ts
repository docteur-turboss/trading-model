import { Router } from "express";
import {
  register,
  listServices,
  getServiceInstances,
  getInstance,
} from "../controllers/Register.controller";

/**
 * Registry Routes
 * ----------------------------------
 *
 * Defines all endpoints responsible for:
 * - service instance registration
 * - service discovery
 * - instance-level lookup
 *
 * These routes form the public API of the Service Registry
 * and are mounted under the `` prefix.
 *
 * Architectural notes:
 * - Routes are thin and delegate all logic to controllers
 * - Validation and error handling are handled at controller level
 * - Transport security is enforced upstream (mTLS)
 */
export const registryRoutes = (): Router => {
  /**
   * Express router scoped to registry responsibilities.
   */
  const router = Router();

  /**
   * -------------------------
   * Instance Registration
   * -------------------------
   *
   * POST /register
   *
   * Registers a new service instance or updates an existing one.
   *
   * Characteristics:
   * - Idempotent per (serviceName + instanceId)
   * - Supports automatic instanceId generation
   * - Initializes TTL and heartbeat metadata
   */
  router.post("/register", register);

  /**
   * -------------------------
   * Service Listing
   * -------------------------
   *
   * GET /services
   *
   * Returns the list of all registered service names.
   *
   * Intended usage:
   * - service discovery clients
   * - administrative tooling
   */
  router.get("/services", listServices);

  /**
   * -------------------------
   * Service Instance Listing
   * -------------------------
   *
   * GET /services/:serviceName
   *
   * Returns all instances registered for a given service.
   *
   * Notes:
   * - May include instances that are close to TTL expiration
   * - Liveness enforcement is handled by LeaseManager
   */
  router.get("/services/:serviceName", getServiceInstances);

  /**
   * -------------------------
   * Instance Lookup
   * -------------------------
   *
   * GET /services/:serviceName/:instanceId
   *
   * Returns detailed metadata for a specific service instance.
   *
   * Typical use cases:
   * - debugging
   * - targeted health inspection
   * - admin / observability tooling
   */
  router.get(
    "/services/:serviceName/:instanceId",
    getInstance
  );

  /**
   * Return the configured router to be mounted by the application.
   */
  return router;
};