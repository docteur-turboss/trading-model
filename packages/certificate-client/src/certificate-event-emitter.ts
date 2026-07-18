import type { ObtainedCertificate } from "./certificate-client";

export function notifyOnRenew(
	onRenew: ((cert: ObtainedCertificate) => void) | undefined,
	cert: ObtainedCertificate
): void {
	if (onRenew) {
		setImmediate(() => onRenew(cert));
	}
}
