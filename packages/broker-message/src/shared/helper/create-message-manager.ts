import type addressManagerClient from '@trading-model/address-manager';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';

import MessageManagerClass from '../../index';

/** Configuration options for creating a MessageManager instance. */
export type MessageManagerOptions = {
  addressManagerClient: addressManagerClient;
  CertificatePath: string;
  instanceId: string;
  KeyCertificatePath: string;
  RootCACertPath: string;
  serviceName: ServiceInstanceName;
  callbackPath: string;
};

/** Creates a MessageManager instance with its bound Express listener.
 *
 * @param options - Configuration options
 * @returns An object containing the MessageManager instance and its Express listener
 */
export function createMessageManager(options: MessageManagerOptions) {
  const ma = new MessageManagerClass({
    addressManagerClient: options.addressManagerClient,
    CertificatePath: options.CertificatePath,
    instanceId: options.instanceId,
    KeyCertificatePath: options.KeyCertificatePath,
    RootCACertPath: options.RootCACertPath,
    serviceName: options.serviceName,
    callbackPath: options.callbackPath,
  });

  return {
    MessageManager: ma,
    MessageManagerListenExpress: ma.listenExpress.bind(ma),
  };
}
