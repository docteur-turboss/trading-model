import type https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import { toSecureContextOptions } from "@trading-model/common/domain/tls-paths";
import type { BootstrapConfig } from "./certificate-bootstrap-config";
import { CertificateClient } from "./certificate-client";

export function setupAutoRenew(
	server: https.Server | { raw: https.Server },
	config: BootstrapConfig
): void {
	const certClient = new CertificateClient({
		...config,
		serviceId:
			config.serviceId as unknown as import("@trading-model/common/domain/primitives").ServiceId,
		onRenew: (cert) => {
			const target = "raw" in server ? server.raw : server;
			try {
				target.setSecureContext(toSecureContextOptions(cert));
				logger.info("TLS context hot-reloaded after certificate renewal");
			} catch (err) {
				logger.error("Failed to hot-reload TLS context", { err });
			}
		},
	});
	void certClient.orchestrator.obtainCertificate().then((holder) => {
		setTimeout(() => holder.startAutoRenew(), 1000).unref();
	});
}
