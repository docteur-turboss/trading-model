import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { createHeartbeatController } from '../controllers/heartbeat.controller';
import { ServiceRegistry } from '../core/service-registry';

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
export const heartbeatRoutes = (registry: ServiceRegistry): Router => {
  const { heartbeat, rotateToken } = createHeartbeatController(registry);

  /**
   * Express router instance scoped to registry heartbeat concerns.
   */
  const router = Router();

  const heartbeatLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many heartbeat requests, please try again later' },
  });

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
  router.post('/heartbeat', heartbeatLimiter, heartbeat);

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
  router.post('/token/rotate', heartbeatLimiter, rotateToken);

  /**
   * Return the configured router to be mounted by the application.
   */
  return router;
};
