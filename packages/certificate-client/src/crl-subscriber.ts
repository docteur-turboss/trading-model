import type BrokerMessage from "@trading-model/broker-message";
import { EVENT_MANAGER } from "@trading-model/broker-message";
import { clearValidationCache } from "@trading-model/certificate-utils/validate-certificate";
import type {
	SerialNumber,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { CertificateEvent } from "@trading-model/validation/contracts/certificate-events";

export interface CrlSubscriberCallbacks {
	onCertificateRevoked?: (payload: {
		serialNumber: SerialNumber;
		serviceId: ServiceId;
	}) => void;
	onCaKeyRotated?: (payload: { keyId: string }) => void;
}

function _onCertificateRevoked(
	payload: unknown,
	callbacks?: CrlSubscriberCallbacks
): void {
	clearValidationCache();
	callbacks?.onCertificateRevoked?.(
		payload as { serialNumber: SerialNumber; serviceId: ServiceId }
	);
}

function _onCaKeyRotated(
	payload: unknown,
	callbacks?: CrlSubscriberCallbacks
): void {
	clearValidationCache();
	callbacks?.onCaKeyRotated?.(payload as { keyId: string });
}

function _buildCleanup(callbacks?: CrlSubscriberCallbacks): {
	cleanupRevoked: () => void;
	cleanupRotated: () => void;
} {
	return {
		cleanupRevoked: EVENT_MANAGER.on(
			CertificateEvent.CertificateRevoked,
			(payload: unknown) => _onCertificateRevoked(payload, callbacks)
		),
		cleanupRotated: EVENT_MANAGER.on(
			CertificateEvent.CaKeyRotated,
			(payload: unknown) => _onCaKeyRotated(payload, callbacks)
		),
	};
}

export async function subscribeToCertificateEvents(
	messageManager: BrokerMessage,
	callbacks?: CrlSubscriberCallbacks
): Promise<() => void> {
	const { cleanupRevoked, cleanupRotated } = _buildCleanup(callbacks);
	await messageManager.intents([
		CertificateEvent.CertificateRevoked,
		CertificateEvent.CaKeyRotated,
	]);
	return () => {
		cleanupRevoked();
		cleanupRotated();
	};
}
