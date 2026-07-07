import type { ObtainedCertificate } from "./certificate-client";

export class CertificateEventEmitter {
	notifyOnRenew(
		onRenew: ((cert: ObtainedCertificate) => void) | undefined,
		cert: ObtainedCertificate
	): void {
		if (onRenew) {
			setImmediate(() => onRenew(cert));
		}
	}
}
