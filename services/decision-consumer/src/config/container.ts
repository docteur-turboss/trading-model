import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { runJob } from "@trading-model/http/correlation-id";
import { ScraperClient } from "@trading-model/model-runtime/model-api/scraper-client";
import { TrainerClient } from "@trading-model/model-runtime/model-api/trainer-client";
import { ModelManifest } from "@trading-model/model-runtime/model-manifest";
import { InstanceId } from "@trading-model/primitives/primitives";
import { PromotionAudit } from "../adapters/outbound/promotion-audit";
import { RiskClient } from "../adapters/outbound/risk-client";
import { createDecisionTick } from "../application/decide";
import { createServer } from "../application/server";
import { parsePromoted } from "../domain/decision";
import { ENV } from "../infrastructure/config/env";
import { FIND_A_SERVICE } from "./address-manager";
import { DECISION_SKIPPED_TOTAL } from "./metrics";

/** Wires the service: trainer, scraper and risk clients, the promotion list and the decision pass (paper only: no broker, no kill switch). */
export async function createDecisionConsumerApp() {
	const tls = buildTlsFromEnv(ENV);
	const tick = createDecisionTick({
		promoted: parsePromoted(ENV.PROMOTED_MODELS),
		trainer: new TrainerClient(tls, FIND_A_SERVICE, ModelManifest),
		scraper: new ScraperClient(tls, FIND_A_SERVICE),
		risk: new RiskClient(tls),
		audit: new PromotionAudit(InstanceId.of(ENV.INSTANCE_ID)),
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
			.catch((error: unknown) => {
				DECISION_SKIPPED_TOTAL.inc({ reason: "error" });
				getLogger().error("decision pass failed", {
					error: normalizeError(error),
				});
			})
			.finally(() => {
				running = false;
			});
	}, ENV.DECISION_TICK_MS);
	timer.unref();
	return { server: await createServer(), stop: () => clearInterval(timer) };
}
