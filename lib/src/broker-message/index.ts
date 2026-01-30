import { HttpClient } from "config/httpClient";
import addressManagerClient from "adress-manager/index";
import { ServiceInstanceName } from "config/services.types";
import { MessageManagerClient } from "./client/messageManagerClient";

export default class {
    private httpClient: HttpClient;
    private MessageManagerClient: MessageManagerClient;
    private topics: string[]|null = null;

    constructor(
        private instanceId: string,
        private RootCACertPath: string,
        private CertificatPath: string,
        private KeyCertificatPath: string,
        private addressManagerClient: addressManagerClient,
        private serviceName: keyof typeof ServiceInstanceName,
    ) {
        this.httpClient = new HttpClient({
            ca: RootCACertPath,
            cert: CertificatPath,
            key: KeyCertificatPath
        });

        this.MessageManagerClient = new MessageManagerClient(this.httpClient, {
            callbackPath: "message",
            instanceId,
            serviceName
        }, addressManagerClient)
    }

    async listenTopics (topics: string[]): Promise<void> {
        await this.MessageManagerClient.SubscribeToTopics(topics);
        this.topics = topics
    }

    async stopMessageManager (): Promise<void> {
        await this.MessageManagerClient.UnSubscribeToTopic(this.topics??[])
        this.topics = null;
    }
}