import { FIND_A_SERVICE } from "../config/address-manager";
import { ENV } from "../config/env";
import { logger } from "../config/logger";

export async function resolveMessageManagerUrl(): Promise<string | null> {
	let url: string | null = ENV.MESSAGE_MANAGER_URL ?? null;
	if (!url) {
		try {
			const target = await FIND_A_SERVICE("message-manager" as never);
			if (target) {
				url = `https://${target.ip}:${target.port}`;
			}
		} catch {
			logger.warn("DLQ address-manager resolution failed");
		}
	}
	return url;
}
