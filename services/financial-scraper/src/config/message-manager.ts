import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import MessageManagerClass from '@trading-model/broker-message';
import { AddressManager } from './address-manager';
import { env } from './env';

const ma = new MessageManagerClass({
  addressManagerClient: AddressManager,
  CertificatPath: env.TLS_CERT_PATH,
  instanceId: env.INSTANCE_ID,
  KeyCertificatPath: env.TLS_KEY_PATH,
  RootCACertPath: env.TLS_CA_PATH,
  serviceName: env.SERVICE_NAME as keyof typeof ServiceInstanceName,
  callbackPath: env.MESSAGE_CALLBACK_PATH,
});

export { ma as MessageManager };

export const MessageManagerListenExpress = ma.listenExpress.bind(ma);
