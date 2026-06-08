/**
 * @file broker.routes.ts
 *
 * @description
 * Exposes **Express-compatible route handlers** for the broker module.
 * Handles:
 * - Subscribing a service to a topic
 * - Unsubscribing a service from a topic
 * - Publishing a message to a topic
 *
 * Each handler uses **Zod validation** to ensure request payload correctness
 * and **ResponseException** to standardize HTTP responses.
 *
 * @responsability
 * - Validate HTTP requests for broker operations
 * - Forward requests to the Broker core
 * - Handle success and error responses uniformly
 *
 * @restrictions
 * - These functions are middleware factories, not full Express apps
 * - Always throw exceptions to signal HTTP response codes
 * - Must be used inside a try/catch wrapper (here `catchSync`)
 *
 * @architecture
 * Layer connecting the **core Broker** to HTTP endpoints.
 * No business logic is performed here; purely request/response orchestration.
 */

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { PublishSchema, SubscribeSchema, UnsubscribeSchema } from './validation/broker.schema';
import { Dispatcher } from '../core/dispatcher';

/**
 * Subscribe a service to a topic
 *
 * @description
 * Validates the request body against the `SubscribeSchema` and forwards
 * the subscription request to the Dispatcher instance.
 * Responds with HTTP 204 No Content on success.
 *
 * @param dispatcher - The Dispatcher instance used to manage subscriptions.
 * @returns Express-compatible middleware function
 *
 * @throws {ResponseException.BadRequest} If validation fails
 * @throws {ResponseException.NoContent} On successful subscription
 */
export const SubscriptionToATopic = (dispatcher: Dispatcher) =>
  catchSync(req => {
    const parsed = SubscribeSchema.safeParse(req.body);

    if (!parsed.success) return sendResponse({ error: parsed.error.message }, 400);

    dispatcher.subscribe(parsed.data);

    return sendResponse(undefined, 204);
  });

/**
 * Unsubscribe a service from a topic
 *
 * @description
 * Validates the request body against the `UnsubscribeSchema` and forwards
 * the unsubscription request to the Dispatcher instance.
 * Responds with HTTP 204 No Content on success.
 *
 * @param dispatcher - The Dispatcher instance used to manage subscriptions.
 * @returns Express-compatible middleware function
 */
export const DeleteASubscription = (dispatcher: Dispatcher) =>
  catchSync(req => {
    const parsed = UnsubscribeSchema.safeParse(req.body);

    if (!parsed.success) return sendResponse({ error: parsed.error.message }, 400);

    dispatcher.unsubscribe(parsed.data);

    return sendResponse(undefined, 204);
  });

/**
 * Publish a message to a topic
 *
 * @description
 * Validates the request body against the `PublishSchema` and forwards
 * the payload and metadata to the Dispatcher instance.
 * Responds with HTTP 204 No Content on success.
 *
 * @param dispatcher - The Dispatcher instance used to publish messages.
 * @returns Express-compatible middleware function
 */
export const PublishAMessage = (dispatcher: Dispatcher) =>
  catchSync(async req => {
    const parsed = PublishSchema.safeParse(req.body);

    if (!parsed.success) return sendResponse({ error: parsed.error.message }, 400);

    await dispatcher.publish(parsed.data.payload, parsed.data.metadata);

    return sendResponse(undefined, 204);
  });
