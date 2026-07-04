import type BrokerMessage from "@trading-model/broker-message";
import { EVENT_MANAGER } from "@trading-model/broker-message";
import { clearValidationCache } from "@trading-model/certificate-utils/validate-certificate";
import { EnumEventMessage } from "@trading-model/common/config/event.types";

export interface CrlSubscriberCallbacks {
	onCertificateRevoked?: (payload: {
		serialNumber: string;
		serviceId: string;
	}) => void;
	onCaKeyRotated?: (payload: { keyId: string }) => void;
}

export async function subscribeToCertificateEvents(
	messageManager: BrokerMessage,
	callbacks?: CrlSubscriberCallbacks
): Promise<() => void> {
	const cleanupRevoked = EVENT_MANAGER.on(
		EnumEventMessage.certificateRevoked,
		(payload: unknown) => {
			clearValidationCache();
			callbacks?.onCertificateRevoked?.(
				payload as { serialNumber: string; serviceId: string }
			);
		}
	);

	const cleanupRotated = EVENT_MANAGER.on(
		EnumEventMessage.caKeyRotated,
		(payload: unknown) => {
			clearValidationCache();
			callbacks?.onCaKeyRotated?.(payload as { keyId: string });
		}
	);

	await messageManager.intents([
		EnumEventMessage.certificateRevoked,
		EnumEventMessage.caKeyRotated,
	]);

	return () => {
		cleanupRevoked();
		cleanupRotated();
	};
}
