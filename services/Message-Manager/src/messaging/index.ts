/**
 * @file index.ts
 * 
 * @description
 * This module initializes the **broker system** with TLS configuration, message dispatcher, 
 * and exposes the HTTP routes for publishing and subscribing messages.
 * 
 * @responsability
 * - Instantiate the Broker core with a Dispatcher
 * - Configure TLS HTTP client for internal message delivery
 * - Expose Express routes for message publication and subscription management
 * 
 * @restrictions
 * - This module does not handle business logic of messages
 * - TLS paths must point to valid certificate files
 * - Only one instance of Broker should be created per process
 * 
 * @architecture
 * Acts as the **entry point for the broker service**.
 * Composition:
 * - `HttpClient` → handles secure HTTP communication
 * - `Dispatcher` → manages subscriptions and message delivery
 * - `Broker` → exposes publish/subscribe API
 * - `BrokerRoutes` → maps HTTP endpoints to broker actions
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.28
 */
import { HttpClient } from "cash-lib/config/httpClient";
import { BrokerRoutes } from "./transport/http.routes";
import { BrokerConfig } from "./broker.type";
import { Dispatcher } from "./core/dispatcher";
import { Broker } from "./core/broker";
import { Application } from "express";

/**
 * BrokerModule
 * 
 * @description
 * Encapsulates the broker system initialization.
 * Instantiates the HTTP client, dispatcher, and broker core, 
 * and exposes an Express listener to attach broker routes.
 */
export default class BrokerModule {
    /** Core Broker instance */
    private Broker: Broker;

    /** Dispatcher managing subscriptions and message delivery */
    private Dispatcher: Dispatcher;

    /** HTTP client for internal broker communication */
    private HTTPCLIENT: HttpClient;

    /** Method to attach broker routes to an Express app */
    public listen: (app: Application) => void;

    /**
     * Constructor
     * 
     * @param {BrokerConfig} config
     * TLS and connection configuration for the broker
     */
    constructor(config: BrokerConfig) {
        this.HTTPCLIENT = new HttpClient({
            ca: config.RootCACertPath,
            cert: config.CertificatPath,
            key: config.KeyCertificatPath
        });

        this.Dispatcher = new Dispatcher(this.HTTPCLIENT);
        this.Broker = new Broker(this.Dispatcher);

        this.listen = (app) => app.use(BrokerRoutes(this.Broker));
    }
}