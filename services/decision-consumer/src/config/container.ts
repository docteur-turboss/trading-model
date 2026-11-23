import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { runJob } from "@trading-model/http/correlation-id";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { PromotionAudit } from "../adapters/outbound/promotion-audit";
import { RiskClient } from "../adapters/outbound/risk-client";
import { ScraperClient } from "../adapters/outbound/scraper-client";
import { TrainerClient } from "../adapters/outbound/trainer-client";
import { createDecisionTick } from "../application/decide";
import { createServer } from "../application/server";
import { parsePromoted } from "../domain/decision";
import { ENV } from "../infrastructure/config/env";

/** Wires the service: trainer, scraper and risk clients, the promotion list and the decision pass (paper only: no broker, no kill switch). */
export async function createDecisionConsumerApp() {
	const tls = buildTlsFromEnv(ENV);
	const tick = createDecisionTick({
		promoted: parsePromoted(ENV.PROMOTED_MODELS),
		trainer: new TrainerClient(tls),
		scraper: new ScraperClient(tls),
		risk: new RiskClient(tls),
		audit: new PromotionAudit(
			tls,
			toInstanceId(ENV.INSTANCE_ID),
			ENV.MESSAGE_CALLBACK_PATH
		),
		windowBars: ENV.DECISION_WINDOW_BARS,
	});
	let running = false;
	const timer = setInterval(() => {
		// A slow pass is not stacked on itself.
		if (running) {
			return;
		}
		running = true;
		void runJob("decision-consumer.tick", tick)
			.catch((error: unknown) =>
				getLogger().error("decision pass failed", {
					error: normalizeError(error),
				})
			)
			.finally(() => {
				running = false;
			});
	}, ENV.DECISION_TICK_MS);
	timer.unref();
	return { server: await createServer(), stop: () => clearInterval(timer) };
}
