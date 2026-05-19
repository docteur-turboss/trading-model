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
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.28
 */

import { Router } from "express";
import {
    SubscriptionToATopic,
    DeleteASubscription,
    PublishAMessage,
} from './http.controller'
import { Broker } from "../core/broker";

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
 * @param {Broker} broker Instance of the broker used to handle requests
 * @returns {Router} Configured Express Router
 */
export const BrokerRoutes = (broker: Broker): Router => {  
    const router = Router();

    router.post('/message', PublishAMessage(broker));
    router.post('/subscription', SubscriptionToATopic(broker));
    router.delete("/subscription", DeleteASubscription(broker));

    return router;
}
