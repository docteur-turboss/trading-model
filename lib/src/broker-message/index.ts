import { Application } from "express";
import addressManagerClient from "adress-manager/index";
import { HttpClient } from "../common/config/httpClient";
import { EventManager } from "./client/eventManagerClient";
import { EventEnumMap } from "../common/config/event.types";
import { CreateCallbackRoute } from "./http/messages.routes";
import { MessageMetadata } from "./shared/helper/messages/message";
import { MessageManagerClient } from "./client/messageManagerClient";
import { ServiceInstanceName } from "../common/config/services.types";

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

    async intents (topics: Parameters<MessageManagerClient['SubscribeToTopics']>[0]): Promise<void> {
        await this.MessageManagerClient.SubscribeToTopics(topics);
        this.topics = topics;
    }

    async stopMessageManager (): Promise<void> {
        await this.MessageManagerClient.UnSubscribeToTopic(this.topics??[]);
        this.event.forEach((killFunction) => killFunction());
        this.topics = null;
    }

    on<K extends Parameters<typeof EventManager["on"]>[0]>(event: K, listener: Parameters<typeof EventManager["on"]>[1]) {
        this.event.push(EventManager.on(event, listener));
    }

    listenExpress (app: Application) {
        app.use(CreateCallbackRoute(this.callbackPath));
    }

    post = {
        direct: <T = Parameters<MessageManagerClient['publishDirectMessage']>[1]>(service: Parameters<MessageManagerClient['publishDirectMessage']>[0] , payload: T, metadata: Parameters<MessageManagerClient['publishDirectMessage']>[2]) => {
            return this.MessageManagerClient.publishDirectMessage(service, payload, metadata);
        },
        indirect: <T = Parameters<MessageManagerClient['publishAsyncMessage']>[0]>(payload: T, metadata: Parameters<MessageManagerClient['publishAsyncMessage']>[1]) => {
            return this.MessageManagerClient.publishAsyncMessage(payload, metadata);
        }
    }
}

export const helper = {
    MetadataBuilder: MessageMetadata,
}