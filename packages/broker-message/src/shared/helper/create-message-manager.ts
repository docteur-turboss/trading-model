import type addressManagerClient from "@trading-model/address-manager";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import MessageManagerClass from "../../index";
import type { MessageManagerConfig } from "../types/config";

/** Configuration options for creating a MessageManager instance. */
export interface MessageManagerOptions extends MessageManagerConfig {
	addressManagerClient: addressManagerClient;
	tlsPaths: TlsPaths;
}

/** Creates a MessageManager instance with its bound Express listener.
 *
 * @param options - Configuration options
 * @returns An object containing the MessageManager instance and its Express listener
 */
export function createMessageManager(options: MessageManagerOptions) {
	const ma = new MessageManagerClass({
		addressManagerClient: options.addressManagerClient,
		tlsPaths: options.tlsPaths,
		instanceId: options.instanceId,
		serviceName: options.serviceName,
		callbackPath: options.callbackPath,
	});
	return {
		messageManager: ma,
		messageManagerListenExpress: ma.listenExpress.bind(ma),
	};
}

interface ServiceEnv {
	TLS_CERT_PATH: string;
	TLS_KEY_PATH: string;
	TLS_CA_PATH: string;
	INSTANCE_ID: string;
	SERVICE_NAME: string;
	MESSAGE_CALLBACK_PATH: string;
}

/**
 * Convenience factory that extracts TLS paths and identity from a service env
 * object, eliminating the need for each service to manually pluck the same
 * fields. Pass the service's env object (which must contain TLS_CERT_PATH,
 * TLS_KEY_PATH, TLS_CA_PATH, INSTANCE_ID, SERVICE_NAME, MESSAGE_CALLBACK_PATH).
 */
export function createServiceMessageManager(
	addressManagerClient: addressManagerClient,
	env: ServiceEnv
) {
	return createMessageManager({
		addressManagerClient,
		tlsPaths: {
			certPath: env.TLS_CERT_PATH,
			keyPath: env.TLS_KEY_PATH,
			caPath: env.TLS_CA_PATH,
		},
		instanceId: env.INSTANCE_ID,
		serviceName: env.SERVICE_NAME as ServiceInstanceName,
		callbackPath: env.MESSAGE_CALLBACK_PATH,
	});
}
