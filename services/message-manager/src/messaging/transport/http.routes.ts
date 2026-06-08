/**
 * @file broker.routes.ts
 *
 * @description
 * This module exposes **HTTP endpoints** for broker operations
 * such as subscribing to topics, unsubscribing, and publishing messages.
 * It defines an Express router that delegates requests to the broker instance.
 *
 * @responsability
 * - Expose RESTful endpoints for broker interactions
 * - Validate and forward HTTP requests to the Broker instance
 * - Provide a consistent response protocol (via controllers)
 *
 * @restrictions
 * - Endpoints are intended for internal service-to-service communication
 * - No business logic is implemented here; only request routing and validation
 * - All payloads must conform to broker schema validation
 *
 * @architecture
 * Part of the **API layer** in the broker system.
 * Delegates all logic to controllers and Broker core services.
 */

import { Router } from 'express';

import { SubscriptionToATopic, DeleteASubscription, PublishAMessage } from './http.controller';
import { Dispatcher } from '../core/dispatcher';

/**
 * BrokerRoutes
 *
 * @description
 * Creates an Express Router that exposes broker-related endpoints.
 *
 * Routes:
 * - POST `/subscription` → subscribe to a topic
 * - DELETE `/subscription` → unsubscribe from a topic
 * - POST `/message` → publish a message to a topic
 *
 * @param dispatcher - Instance of the dispatcher used to handle requests.
 * @returns {Router} Configured Express Router
 */
export const BrokerRoutes = (dispatcher: Dispatcher): Router => {
  const router = Router();

  router.post('/message', PublishAMessage(dispatcher));
  router.post('/subscription', SubscriptionToATopic(dispatcher));
  router.delete('/subscription', DeleteASubscription(dispatcher));

  return router;
};
