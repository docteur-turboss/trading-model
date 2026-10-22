import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { createTraderTrainerContainer } from "../config/container";
import { MessageManager } from "../config/message-manager";
import { DataType } from "../domain/data-handlers/data-types";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const NULL_ADDRESS_MANAGER = { stop() {} };

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> =
	NULL_ADDRESS_MANAGER as ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;

const CONTAINER = createTraderTrainerContainer(ENV);

const { trainer, eventHandler, trainingLoop, symbols } = CONTAINER;

createBootstrap({
	name: "Trader Trainer",
	createServer: () => createServer(trainer),
	onStart: async () => {
		initializeTelemetry({
			serviceName: ServiceInstanceName.TraderTrainerService,
			serviceVersion: process.env.APP_VERSION ?? "1.0.0",
			instanceId: toInstanceId(process.env.INSTANCE_ID ?? "trader-trainer-1"),
			otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
		});
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();

		MessageManager.on("fetchCandlestickSeries" as never, (data: never) =>
			eventHandler.handle(DataType.Candle, data)
		);
		MessageManager.on("fetchRecentTrades" as never, (data: never) =>
			eventHandler.handle(DataType.Trade, data)
		);
		MessageManager.on("fetchOrderBookSnapshot" as never, (data: never) =>
			eventHandler.handle(DataType.OrderBook, data)
		);
		MessageManager.on("fetchOrderBookTickerSnapshot" as never, (data: never) =>
			eventHandler.handle(DataType.BookTicker, data)
		);
		MessageManager.on("fetch24hrTickerStats" as never, (data: never) =>
			eventHandler.handle(DataType.Ticker, data)
		);
		MessageManager.on("fetchPriceTickerSnapshot" as never, (data: never) =>
			eventHandler.handle(DataType.Price, data)
		);

		await MessageManager.intents(eventHandler.getSubscribedIntents());

		trainingLoop.start({
			symbols,
			intervalMs: 60_000,
		});
	},
	onStop: async () => {
		trainingLoop.stop();
		addressManager.stop();
		await MessageManager.stopMessageManager();
		await shutdownTelemetry();
	},
});
