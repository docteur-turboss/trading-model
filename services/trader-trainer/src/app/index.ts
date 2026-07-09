import { toSymbol } from "@trading-model/common/domain/primitives";
import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { ENV } from "../config/env";
import { MessageManager } from "../config/message-manager";
import { ApplicationContainer } from "./container";
import { createServer } from "./server";

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

const { trainer } = CONTAINER;

createBootstrap({
	name: "Trader Trainer",
	createServer: () => createServer(trainer),
	onStart: async () => {
		addressManager = BOOTSTRAP_ADDRESS_MANAGER();

		MessageManager.on("fetchCandlestickSeries" as never, (data: never) =>
			CONTAINER.onCandlestickSeries(data as never)
		);
		MessageManager.on("fetchRecentTrades" as never, (data: never) =>
			CONTAINER.onRecentTrades(data as never)
		);
		MessageManager.on("fetchOrderBookSnapshot" as never, (data: never) =>
			CONTAINER.onOrderBookSnapshot(data as never)
		);
		MessageManager.on("fetchOrderBookTickerSnapshot" as never, (data: never) =>
			CONTAINER.onOrderBookTickerSnapshot(data as never)
		);
		MessageManager.on("fetch24hrTickerStats" as never, (data: never) =>
			CONTAINER.on24hrTickerStats(data as never)
		);
		MessageManager.on("fetchPriceTickerSnapshot" as never, (data: never) =>
			CONTAINER.onPriceTickerSnapshot(data as never)
		);

		await MessageManager.intents(CONTAINER.getSubscribedIntents());

		CONTAINER.startTrainingLoop(
			ENV.TRAINER_SYMBOLS.split(",").map((symbol) => toSymbol(symbol.trim())),
			60_000
		);
	},
	onStop: async () => {
		CONTAINER.stopTrainingLoop();
		addressManager.stop();
		await MessageManager.stopMessageManager();
	},
});
