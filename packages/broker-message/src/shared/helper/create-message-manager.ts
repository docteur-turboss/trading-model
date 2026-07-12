import type addressManagerClient from "@trading-model/address-manager";
import { parseServiceName } from "@trading-model/common/config/services.types";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import {
	buildTlsFromEnv,
	type TlsEnvVars,
	type TlsPaths,
} from "@trading-model/common/domain/tls-paths";
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

interface ServiceEnv extends TlsEnvVars {
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
		tlsPaths: buildTlsFromEnv(env),
		instanceId: toInstanceId(env.INSTANCE_ID),
		serviceName: parseServiceName(env.SERVICE_NAME),
		callbackPath: env.MESSAGE_CALLBACK_PATH,
	});
}
