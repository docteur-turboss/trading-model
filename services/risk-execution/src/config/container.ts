import { join } from "node:path";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { mountRoute } from "@trading-model/http/api-route/mount-route";
import { runJob } from "@trading-model/http/correlation-id";
import { createServiceServer } from "@trading-model/http/service-server-factory";
import { ServiceId } from "@trading-model/primitives/primitives";
import { Router } from "express";
import { RISK_API } from "../adapters/inbound/api-routes";
import { createHandlers } from "../adapters/inbound/handlers";
import { JsonFile } from "../adapters/outbound/json-file";
import { PaperBroker } from "../adapters/outbound/paper-broker";
import { ScraperPrices } from "../adapters/outbound/scraper-prices";
import { TrainerAdmission } from "../adapters/outbound/trainer-admission";
import { RiskExecution } from "../application/risk-execution";
import { assertExecutionLock } from "../domain/execution-mode";
import { RiskLimits } from "../domain/limits";
import type { RiskState } from "../domain/state";
import { ENV } from "../infrastructure/config/env";
import { ADDRESS_MANAGER_ROUTES } from "./address-manager";
import { initRiskOutbox, publishRiskEvent, replayRiskEvents } from "./audit";
import {
	metricsHandler,
	RISK_DAILY_LOSS,
	RISK_EXPOSURE_RATIO,
	RISK_KILL_SWITCH,
	RISK_MARKET_DATA_AGE_SECONDS,
	RISK_OPEN_ORDERS,
	RISK_ORDERS_TOTAL,
	RISK_RECONCILIATION_MISMATCH,
	RISK_TICK_FAILURES,
} from "./metrics";
import { runTick } from "./run-tick";

export type RiskExecutionApp = Awaited<
	ReturnType<typeof createRiskExecutionApp>
>;

/**
 * Wires the service. Refuses to start on a forbidden mode/environment/keys
 * combination or on limits above their ceiling (fail closed, ADR-0064 §2, §6).
 */
export async function createRiskExecutionApp() {
	const hasLiveKeys = Boolean(ENV.BROKER_API_KEY || ENV.BROKER_API_SECRET);
	assertExecutionLock({
		mode: ENV.EXECUTION_MODE,
		env: ENV.DEPLOYMENT_ENV,
		hasLiveKeys,
	});
	if (ENV.EXECUTION_MODE === "live") {
		throw new Error(
			"EXECUTION_MODE=live: no live broker adapter in this release (ADR-0064 §9)"
		);
	}
	const limits = RiskLimits.parse({
		...JSON.parse(ENV.RISK_LIMITS_JSON),
		allocatedCapital: ENV.RISK_ALLOCATED_CAPITAL,
		instruments: JSON.parse(ENV.RISK_INSTRUMENTS),
	});
	const mode = ENV.EXECUTION_MODE;
	const tls = buildTlsFromEnv(ENV);
	await initRiskOutbox(
		new JsonFile(join(ENV.RISK_STATE_DIR, "risk-event-outbox.json"))
	);
	const risk = new RiskExecution({
		limits,
		mode,
		ownerActor: ENV.RISK_OWNER_ACTOR,
		broker: new PaperBroker(
			new JsonFile(join(ENV.RISK_STATE_DIR, "paper-ledger.json")),
			limits.allocatedCapital,
			limits.feeBps,
			limits.slippageBps
		),
		store: new JsonFile<RiskState>(join(ENV.RISK_STATE_DIR, "state.json")),
		admission: new TrainerAdmission(tls, ENV.TRAINER_MODEL_DIR),
		prices: new ScraperPrices(tls),
		emit: (event, fields) => {
			getLogger().info(event, fields);
			publishRiskEvent(event, fields);
		},
	});
	await risk.start();

	const publish = () => {
		const snapshot = risk.status();
		RISK_KILL_SWITCH.set(
			{ mode, scope: "global" },
			snapshot.killSwitch.global ? 1 : 0
		);
		RISK_KILL_SWITCH.set(
			{ mode, scope: "symbol" },
			Object.keys(snapshot.killSwitch.symbols).length > 0 ? 1 : 0
		);
		RISK_RECONCILIATION_MISMATCH.set({ mode }, snapshot.mismatch ? 1 : 0);
		RISK_EXPOSURE_RATIO.set({ mode }, snapshot.exposureRatio);
		RISK_DAILY_LOSS.set({ mode }, snapshot.dailyLoss);
		RISK_OPEN_ORDERS.set({ mode }, snapshot.openOrders);
		RISK_MARKET_DATA_AGE_SECONDS.set({ mode }, snapshot.oldestPriceAgeSeconds);
	};
	publish();
	RISK_TICK_FAILURES.inc({ mode }, 0);
	const timer = setInterval(() => {
		void replayRiskEvents();
		void runTick(
			() =>
				runJob(
					"risk-execution.tick",
					() => risk.tick(),
					(error) => {
						const { message, stack } = normalizeError(error);
						getLogger().error("risk tick failed", { error: message, stack });
						RISK_TICK_FAILURES.inc({ mode });
					}
				),
			publish,
			() => undefined
		);
	}, ENV.RISK_TICK_MS);
	timer.unref();

	const handlers = createHandlers(
		risk,
		(outcome) => RISK_ORDERS_TOTAL.inc({ mode, outcome }),
		["decision-consumer"]
	);
	const server = await createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("risk-execution"),
		routes: (app) => {
			const router = Router();
			mountRoute(router, RISK_API.intent, handlers.intent);
			mountRoute(router, RISK_API.cancel, handlers.cancel);
			mountRoute(router, RISK_API.position, handlers.position);
			mountRoute(router, RISK_API.adminStatus, handlers.adminStatus);
			mountRoute(router, RISK_API.adminEngage, handlers.adminEngage);
			mountRoute(router, RISK_API.adminRearm, handlers.adminRearm);
			app.use(router);
			app.get("/metrics", metricsHandler);
			ADDRESS_MANAGER_ROUTES(app);
		},
		readiness: [{ name: "reconciliation", check: () => risk.isReady() }],
	});
	return { server, stop: () => clearInterval(timer) };
}
