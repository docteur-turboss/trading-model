import { HttpClient } from "cash-lib/config/httpClient";
import { BrokerRoutes } from "./transport/http.routes";
import { BrokerConfig } from "./broker.type";
import { Dispatcher } from "./core/dispatcher";
import { Broker } from "./core/broker";
import { Application } from "express";

export default class {
    private Broker: Broker;
    private Dispatcher: Dispatcher;
    private HTTPCLIENT : HttpClient;

    public listen: (app: Application) => void;

    constructor(config : BrokerConfig) {
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