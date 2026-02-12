import { Application } from "express";
import { HttpClient } from "config/httpClient";
import addressManagerClient from "adress-manager/index";
import { ServiceInstanceName } from "config/services.types";
import { CreateCallbackRoute } from "./http/messages.routes";
import { MessageManagerClient } from "./client/messageManagerClient";
import { EventEnumMap, EventMessagesArgs } from "config/event.types";
import { EventManager, Listener } from "./client/eventManagerClient";

export default class {
    private MessageManagerClient: MessageManagerClient;
    private topics: EventEnumMap[]|null = null;
    private event: (() => void)[] = [];
    private callbackPath: string = "message";
    private httpClient: HttpClient;

    constructor({
        addressManagerClient,
        KeyCertificatPath,
        RootCACertPath,
        CertificatPath,
        callbackPath,
        instanceId,
        serviceName,
    }: { 
        instanceId: string,
        callbackPath?: string,
        RootCACertPath: string,
        CertificatPath: string,
        KeyCertificatPath: string,
        addressManagerClient: addressManagerClient,
        serviceName: keyof typeof ServiceInstanceName,
    }) {
        this.callbackPath = callbackPath?callbackPath:this.callbackPath;

        this.httpClient = new HttpClient({
            ca: RootCACertPath,
            cert: CertificatPath,
            key: KeyCertificatPath
        });

        this.MessageManagerClient = new MessageManagerClient(this.httpClient, {
            callbackPath: this.callbackPath,
            instanceId,
            serviceName
        }, addressManagerClient);
    }

    async intents (topics: EventEnumMap[]): Promise<void> {
        await this.MessageManagerClient.SubscribeToTopics(topics);
        this.topics = topics;
    }

    async stopMessageManager (): Promise<void> {
        await this.MessageManagerClient.UnSubscribeToTopic(this.topics??[]);
        this.event.forEach((killFunction) => killFunction());
        this.topics = null;
    }

    on(event: EventEnumMap, listener: Listener<EventMessagesArgs<EventEnumMap>>) {
        this.event.push(EventManager.on(event, listener));
    }

    async listenExpress (app: Application) {
        app.use(CreateCallbackRoute(this.callbackPath));
    }
}