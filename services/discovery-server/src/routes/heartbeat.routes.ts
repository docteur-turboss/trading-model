import { Router } from "express";
import { heartbeat, rotateToken } from "../controllers/Heartbeat.controller";

/**
 * Heartbeat Routes
 * ----------------------------------
 *
 * Defines all endpoints related to:
 * - service instance liveness (heartbeats)
 * - instance credential lifecycle (token rotation)
 *
 * These routes are mounted under the `` prefix
 * by the main application router.
 *
 * Security considerations:
 * - Transport security is enforced via mTLS
 * - Application-level authentication relies on instance tokens
 * - No business logic should be implemented at the routing layer
 */
export const heartbeatRoutes = (): Router => {
  /**
   * Express router instance scoped to registry heartbeat concerns.
   */
  const router = Router();

  /**
   * -------------------------
   * Instance Heartbeat
   * -------------------------
   *
   * POST /heartbeat
   *
   * Called periodically by each service instance to:
   * - confirm it is still alive
   * - extend its lease (TTL) in the Service Registry
   *
   * If heartbeats stop, the LeaseManager will eventually
   * evict the instance from the registry.
   */
  router.post("/heartbeat", heartbeat);

  /**
   * -------------------------
   * Instance Token Rotation
   * -------------------------
   *
   * POST /token/rotate
   *
   * Rotates the authentication token associated with
   * a service instance.
   *
   * Use cases:
   * - scheduled credential rotation
   * - security incident response
   * - short-lived token enforcement
   */
  router.post("/token/rotate", rotateToken);

  /**
   * Return the configured router to be mounted by the application.
   */
  return router;
};