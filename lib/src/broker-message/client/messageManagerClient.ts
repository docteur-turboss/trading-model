import { HttpClient } from "config/httpClient";
import addressManagerClient from "adress-manager/index";
import { MessageMetadata } from "../shared/types/message";
import { ServiceInstanceName } from "config/services.types";
import { MessageManagerConfig } from "../shared/types/config";
import { SubscribesTopicsPayload, UnSubscribesTopicsPayload } from "../shared/types/payloads";
import { MessageManagerError, ServiceUnreachableError } from "utils/Errors.js";

/**
 */
export class MessageManagerClient {
  /**
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: MessageManagerConfig,
    private readonly addressManagerClient: addressManagerClient,
  ) {}

  /**
   */
    private async SubscribesToASingleTopic(topic: string, targetUrl: string): Promise<void> {
        const payload: SubscribesTopicsPayload = {
            callbackPath: this.config.callbackPath,
            consumerIdentity: {
                instanceId: this.config.instanceId,
                serviceName: this.config.serviceName
            },
            topic
        };

        try {
            return await this.httpClient.post(targetUrl, payload);
        } catch (error) {
            throw new MessageManagerError(
                "Failed to subscribe topic to Message Manager",
                error
            );
        }
    }

    
    /**
     */
    private async UnSubscribesToASingleTopic(topic: string, targetUrl: string): Promise<void> {
        const payload: UnSubscribesTopicsPayload = {
            instanceId: this.config.instanceId,
            topic
        };

        try {
            return await this.httpClient.delete(targetUrl, payload);
        } catch (error) {
            throw new MessageManagerError(
                "Failed to unsubscribe topic to Message Manager",
                error
            );
        }
    }

    /**
     * 
     * @param topics 
     * @returns 
     */
    async SubscribeToTopics (topics: string[]): Promise<void> {
        try{
            const target = await this.addressManagerClient.findService(ServiceInstanceName.MessageDeliveryService);
            if(!target) throw new ServiceUnreachableError("Unable to contact the message manager");
            
            for (const topic of topics) {
                this.SubscribesToASingleTopic(topic,
                    `https://${target.ip}:${target.port}/subscribe`
                );
            }
        }catch(e) {
            if(e instanceof ServiceUnreachableError) throw e;
            if(e instanceof MessageManagerError) return;

            throw new MessageManagerError(
                "Failed to subscribe topic to Message Manager",
                e
            )
        }
    }

    /**
     * 
     * @param topics 
     * @returns 
     */
    async UnSubscribeToTopic (topics: string[]): Promise<void> {
        try{
            const target = await this.addressManagerClient.findService(ServiceInstanceName.MessageDeliveryService);
            if(!target) throw new ServiceUnreachableError("Unable to contact the message manager");
            
            for (const topic of topics) {
                this.UnSubscribesToASingleTopic(topic,
                    `https://${target.ip}:${target.port}/subscribe`
                );
            }
        }catch(e) {
            if(e instanceof ServiceUnreachableError) throw e;
            if(e instanceof MessageManagerError) return;

            throw new MessageManagerError(
                "Failed to unsubscribe topic to Message Manager",
                e
            )
        }
    }

    async publishAsyncMessage <T = unknown>(payload: T, metadata: MessageMetadata): Promise<void> {
        try {
            const target = await this.addressManagerClient.findService(ServiceInstanceName.MessageDeliveryService);
            if(!target) throw new ServiceUnreachableError("Unable to contact the message manager");
            
            const Messagepayload = {
                payload,
                metadata
            };

            return await this.httpClient.post(`https://${target.ip}:${target.port}/message`, 
                Messagepayload
            );
        } catch (error) {
            if(error instanceof ServiceUnreachableError) throw error;
            
            throw new MessageManagerError(
                "Failed to publish message to Message Manager",
                error
            )
        }
    }

    async publishDirectMessage <T = unknown>(service: keyof typeof ServiceInstanceName, payload: T, metadata: MessageMetadata): Promise<void> {
                try {
            const target = await this.addressManagerClient.findService(service);
            if(!target) throw new ServiceUnreachableError("Unable to contact the service: " + service);
            
            const Messagepayload = {
                payload,
                metadata
            };

            return await this.httpClient.post(`https://${target.ip}:${target.port}/message`, 
                Messagepayload
            );
        } catch (error) {
            if(error instanceof ServiceUnreachableError) throw error;
            
            throw new MessageManagerError(
                "Failed to publish message to " + service,
                error
            )
        }
    }
}