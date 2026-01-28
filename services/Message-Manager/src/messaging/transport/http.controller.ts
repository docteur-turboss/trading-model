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
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.28
 */

import { catchSync } from "cash-lib/middleware/catchError";
import { Broker } from "../core/broker";
import { PublishSchema, SubscribeSchema, UnsubscribeSchema } from "./validation/broker.schema";
import { ResponseException } from "cash-lib/middleware/responseException";

/**
 * Subscribe a service to a topic
 * 
 * @description
 * Validates the request body against the `SubscribeSchema` and forwards
 * the subscription request to the Broker instance.
 * Responds with HTTP 204 No Content on success.
 * 
 * @param {Broker} broker The Broker instance used to manage subscriptions
 * @returns Express-compatible middleware function
 * 
 * @throws {ResponseException.BadRequest} If validation fails
 * @throws {ResponseException.NoContent} On successful subscription
 */
export const SubscriptionToATopic = (broker: Broker) => 
  catchSync((req) => {
    const parsed = SubscribeSchema.safeParse(req.body);

    if(!parsed.success) 
        throw ResponseException(parsed.error.message).BadRequest();

    broker.subscribe(parsed.data);

    throw ResponseException().NoContent();
});

/**
 * Unsubscribe a service from a topic
 * 
 * @description
 * Validates the request body against the `UnsubscribeSchema` and forwards
 * the unsubscription request to the Broker instance.
 * Responds with HTTP 204 No Content on success.
 * 
 * @param {Broker} broker The Broker instance used to manage subscriptions
 * @returns Express-compatible middleware function
 * 
 * @throws {ResponseException.BadRequest} If validation fails
 * @throws {ResponseException.NoContent} On successful unsubscription
 */
export const DeleteASubscription = (broker: Broker) => 
  catchSync((req) => {
    const parsed = UnsubscribeSchema.safeParse(req.body);

    if(!parsed.success) 
        throw ResponseException(parsed.error.message).BadRequest();

    broker.unsubscribe(parsed.data)
    
    throw ResponseException().NoContent();
});

/**
 * Publish a message to a topic
 * 
 * @description
 * Validates the request body against the `PublishSchema` and forwards
 * the payload and metadata to the Broker instance.
 * Responds with HTTP 204 No Content on success.
 * 
 * @param {Broker} broker The Broker instance used to publish messages
 * @returns Express-compatible middleware function
 * 
 * @throws {ResponseException.BadRequest} If validation fails
 * @throws {ResponseException.NoContent} On successful publish
 */
export const PublishAMessage = (broker: Broker) => 
  catchSync((req) => {
    const parsed = PublishSchema.safeParse(req.body);

    if(!parsed.success) 
        throw ResponseException(parsed.error.message).BadRequest();

    broker.publish(parsed.data.payload, parsed.data.metadata);
    
    throw ResponseException().NoContent();
});