import type { TlsBootstrapOptions } from "@trading-model/common/server/bootstrap";
import { createTlsBootstrap } from "@trading-model/certificate-client";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { reloadHttpClientTls } from "../dlq/controller-reexports";

export function createResilientTlsBootstrap(): TlsBootstrapOptions | null {
	try {
		const tls = createTlsBootstrap(process.env as Record<string, string>);
		if (tls?.setupAutoRenew) {
			const originalSetupAutoRenew = tls.setupAutoRenew.bind(tls);
			tls.setupAutoRenew = (server: import("node:https").Server) => {
				originalSetupAutoRenew(server);
				reloadHttpClientTls().catch((err: unknown) => {
					logger.warn(
						"Failed to reload HTTP client TLS after certificate renewal",
						{ error: normalizeError(err) }
					);
				});
			};
		}
		return tls;
	} catch (err) {
		logger.warn(
			"TLS bootstrap from CA unavailable — falling back to file-based TLS config",
			{ error: normalizeError(err) }
		);
		return null;
	}
}
