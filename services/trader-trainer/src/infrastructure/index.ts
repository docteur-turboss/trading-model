import { toSymbol } from "@trading-model/common/domain/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { createServer } from "../app/server";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { MessageManager } from "../config/message-manager";
import { DataType } from "../core/data-handlers/data-types";
import { ENV } from "./config/env";
import { ApplicationContainer } from "./container";

const NULL_ADDRESS_MANAGER = { stop() {} };

let addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> =
	NULL_ADDRESS_MANAGER as ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;

const CONTAINER = new ApplicationContainer({
	bufferSize: ENV.TRAINER_DATA_WINDOW,
	symbols: ENV.TRAINER_SYMBOLS.split(",").map((symbol) =>
		toSymbol(symbol.trim())
	),
	validationSplit: ENV.TRAINER_VALIDATION_SPLIT,
	generations: ENV.TRAINER_GENERATIONS,
	populationSize: ENV.TRAINER_POPULATION_SIZE,
	timeBudgetMs: ENV.TRAINER_TIME_BUDGET_MS,
	episodesPerIndividual: ENV.TRAINER_EPISODES_PER_INDIVIDUAL,
});

const { trainer, eventHandler, trainingLoop } = CONTAINER;

createBootstrap({
	name: "Trader Trainer",
	createServer: () => createServer(trainer),
	onStart: async () => {
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
			symbols: ENV.TRAINER_SYMBOLS.split(",").map((symbol) =>
				toSymbol(symbol.trim())
			),
			intervalMs: 60_000,
		});
	},
	onStop: async () => {
		trainingLoop.stop();
		addressManager.stop();
		await MessageManager.stopMessageManager();
	},
});
