import { ServiceInstanceName } from "@trading-model/common/config/services.types";
// import { EnumEventMessage } from "@trading-model/common/config/event.types";
import MessageManager from "@trading-model/broker-message";
import { AddressManager } from "./address-manager";
import { env } from "./env";

const ma = new MessageManager({
    addressManagerClient: AddressManager,
    CertificatPath: env.TLS_CERT_PATH,
    instanceId: env.INSTANCE_ID,
    KeyCertificatPath: env.TLS_KEY_PATH,
    RootCACertPath: env.TLS_CA_PATH,
    serviceName: env.SERVICE_NAME as keyof typeof ServiceInstanceName,
    callbackPath: env.MESSAGE_CALLBACK_PATH
});

ma.intents([
    // example : 
    // EnumEventMessage.exampleEvent, 
    // EnumEventMessage.testEvent
]);

//  example :
// manager.on(EnumEventMessage.exampleEvent, () => {
//     // do something
// })
// manager.on(EnumEventMessage.testEvent, ({debug}) => {
//     // do something
// })

export const StopMessageManager = ma.stopMessageManager;
export const MessageManagerListenExpress = ma.listenExpress;
export const MessageManager = ma;