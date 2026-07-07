import { createTlsBootstrap } from "@trading-model/certificate-client";
import { logger } from "@trading-model/common/config/logger";
import type { TlsBootstrapOptions } from "@trading-model/common/server/bootstrap";
import { normalizeError } from "@trading-model/common/utils/errors";
import { dlqRedisQueue } from "../config/redis-queue";
import { rebuildQueueFromMongo } from "../dlq/auto-retry";
import { reloadHttpClientTls } from "../dlq/shared/http-client-manager";

export async function ensureRedisQueue(): Promise<void> {
	try {
		await dlqRedisQueue.connect(() => {
			void rebuildQueueFromMongo();
		});
	} catch (err) {
		logger.warn(
			"Redis queue unavailable on start — operations continue in DEGRADED mode",
			{
				error: normalizeError(err),
			}
		);
	}
}

export function createResilientTlsBootstrap(): TlsBootstrapOptions | null {
	try {
		const tls = createTlsBootstrap(process.env as Record<string, string>);
		if (tls?.setupAutoRenew) {
			_wrapAutoRenew(tls);
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

function _wrapAutoRenew(tls: TlsBootstrapOptions): void {
	const originalSetupAutoRenew = tls.setupAutoRenew.bind(tls);
	tls.setupAutoRenew = (server: import("node:https").Server) => {
		originalSetupAutoRenew(server);
		reloadHttpClientTls().catch((err: unknown) => {
			logger.warn(
				"Failed to reload HTTP client TLS after certificate renewal",
				{
					error: normalizeError(err),
				}
			);
		});
	};
}
