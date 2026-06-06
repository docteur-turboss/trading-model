import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { createMessageManager } from '@trading-model/broker-message/shared/helper/create-message-manager';
import { AddressManager } from './address-manager';
import { env } from './env';

export const { MessageManager, MessageManagerListenExpress } = createMessageManager({
  addressManagerClient: AddressManager,
  CertificatPath: env.TLS_CERT_PATH,
  instanceId: env.INSTANCE_ID,
  KeyCertificatPath: env.TLS_KEY_PATH,
  RootCACertPath: env.TLS_CA_PATH,
  serviceName: env.SERVICE_NAME as ServiceInstanceName,
  callbackPath: env.MESSAGE_CALLBACK_PATH,
});
