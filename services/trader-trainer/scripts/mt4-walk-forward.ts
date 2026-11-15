/**
 * MT4 walk-forward validation of the GA/DQN engine on real candles
 * (scripts/fetch-klines.ts), judged against the success criteria of ADR-0030.
 * For each segment, the real GA (TrainingSession) trains on `window` candles
 * (its own train / validation split), then the genome it would publish is
 * evaluated on the next `test` candles, which no part of training saw. The test
 * segments of a symbol follow each other: chained, they are the out-of-sample
 * track record the criteria read. Every fitness, variant and seed runs on the
 * same segments, so comparisons are paired.
 *
 *   bun scripts/mt4-walk-forward.ts --data btc.json,eth.json --out results.json
 *     [--segments 12] [--window 500] [--test 100] [--population 20]
 *     [--generations 30] [--fitness total_pnl,sharpe,composite]
 *     [--variants shown] [--seeds 3] [--seed-base 0] [--features klines]
 *   bun scripts/mt4-walk-forward.ts --merge a.json,b.json   # summary only
 *
 * Variants: `shown` / `hidden` = the agent sees its position or a constant
 * (ADR-0025). Features: `candles` feeds the candles only; `klines` adds what
 * the candle files allow rebuilding at each close (ADR-0030): the 24h ticker
 * from the previous 24 hours of candles, and the candle's trades as one buyer
 * and one seller aggregate trade from its taker volumes. Binance publishes no
 * order book history: those inputs stay 0.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
	type CandleData,
	CandleInterval,
	MarketType,
	SourceType,
	TradeSide,
} from "@trading-model/contracts/market-data.types";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import { runInProcess } from "../src/application/training-session";
import { DataType } from "../src/domain/data-handlers/data-types";
import { EpisodeScores } from "../src/domain/genetic-algorithm/episode-scores";
import { evalPhase } from "../src/domain/genetic-algorithm/evaluation-phase";
import { barsPerYear } from "../src/domain/genetic-algorithm/evaluation-utils";
import type { MarketStep } from "../src/domain/genetic-algorithm/genome";
import { FitnessType } from "../src/domain/genetic-algorithm/genome-control";
import { makeSeededBackendFactory } from "../src/domain/genetic-algorithm/rl-backend";
import { MarketDataBuffer } from "../src/domain/market-data-buffer";
import { ADMISSION_THRESHOLDS } from "../src/domain/model-admission";

const INITIAL_CASH = 1000;
const DAY_MS = 86_400_000;

/** ADR-0030 success criteria: all must hold. */
const CRITERIA = {
	...ADMISSION_THRESHOLDS,
	/** One-sided t-statistic of the mean segment return. */
	minTStat: 2.0,
	/** Share of (symbol, seed) track records with a positive Sharpe. */
	minPositiveShare: 0.8,
	minSymbols: 2,
	minSegments: 12,
	minSeeds: 3,
};

/** openTime, open, high, low, close, volume, closeTime, then optionally
 * quoteVolume, trade count, taker buy base volume (Binance order). */
type Kline = number[];

interface Options {
	data: string[];
	out: string;
	segments: number;
	window: number;
	test: number;
	population: number;
	generations: number;
	fitness: FitnessType[];
	variants: string[];
	seeds: number;
	/** First seed: parallel runs each take a slice of the seeds. */
	seedBase: number;
	features: "candles" | "klines";
	merge?: string[];
}

interface SegmentResult {
	symbol: string;
	segment: number;
	fitness: string;
	variant: string;
	seed: number;
	features: string;
	testFrom: string;
	testTo: string;
	/** Mean final PnL of the evaluation episodes, % of the initial cash. */
	returnPct: number;
	/** Asset return over the test candles, %. */
	buyAndHoldPct: number;
	/** Strategy PnL per test bar, mean over the evaluation episodes. */
	barPnl: number[];
	/** Asset close per test bar, for the buy and hold track record. */
	closes: number[];
	barsPerYear: number;
	trainSeconds: number;
}

function parseArgs(argv: string[]): Options {
	const arg = (name: string, fallback?: string): string => {
		const idx = argv.indexOf(`--${name}`);
		const value = idx >= 0 ? argv[idx + 1] : fallback;
		if (value === undefined) {
			throw new Error(`missing --${name}`);
		}
		return value;
	};
	const merge = argv.includes("--merge") ? arg("merge").split(",") : undefined;
	return {
		data: merge ? [] : arg("data").split(","),
		out: merge ? "" : arg("out"),
		segments: Number(arg("segments", "12")),
		window: Number(arg("window", "500")),
		test: Number(arg("test", "100")),
		population: Number(arg("population", "20")),
		generations: Number(arg("generations", "30")),
		fitness: arg("fitness", FitnessType.TotalPnl).split(",") as FitnessType[],
		variants: arg("variants", "shown").split(","),
		seeds: Number(arg("seeds", "3")),
		seedBase: Number(arg("seed-base", "0")),
		features: arg("features", "klines") as Options["features"],
		merge,
	};
}

function toCandle(symbol: TradingSymbol, kline: Kline): CandleData {
	return {
		symbol,
		source: SourceType.Binance,
		market: MarketType.Crypto,
		interval: CandleInterval.H1,
		timestamp: UnixTimestamp.of(kline[0]),
		open: Price.of(kline[1]),
		high: Price.of(kline[2]),
		low: Price.of(kline[3]),
		close: Price.of(kline[4]),
		volume: Volume.of(kline[5]),
		closeTimestamp: UnixTimestamp.of(kline[6]),
	};
}

/** The 24h ticker known at the close of `klines[idx]`, if 24h are covered. */
function addTicker(
	buffer: MarketDataBuffer,
	symbol: TradingSymbol,
	klines: Kline[],
	idx: number
): void {
	const close = klines[idx][6];
	let first = idx;
	while (first > 0 && klines[first - 1][0] >= close + 1 - DAY_MS) {
		first--;
	}
	if (klines[first][0] > close + 1 - DAY_MS) {
		return;
	}
	const day = klines.slice(first, idx + 1);
	buffer.addData(DataType.Ticker, symbol, {
		symbol,
		source: SourceType.Binance,
		market: MarketType.Crypto,
		timestamp: UnixTimestamp.of(day[0][0]),
		closeTimestamp: UnixTimestamp.of(close),
		open: Price.of(day[0][1]),
		high: Price.of(Math.max(...day.map((kline) => kline[2]))),
		low: Price.of(Math.min(...day.map((kline) => kline[3]))),
		last: Price.of(klines[idx][4]),
		volume: Volume.of(day.reduce((sum, kline) => sum + kline[5], 0)),
	});
}

/** The candle's trades as one buyer and one seller aggregate trade. */
function addTrades(
	buffer: MarketDataBuffer,
	symbol: TradingSymbol,
	kline: Kline,
	idx: number
): void {
	const [, , , , close, volume, closeTime, quoteVolume, , takerBuy] = kline;
	if (!(volume > 0) || takerBuy === undefined) {
		return;
	}
	const vwap = quoteVolume > 0 ? quoteVolume / volume : close;
	const parts: [TradeSide, number][] = [
		[TradeSide.Buy, takerBuy],
		[TradeSide.Sell, volume - takerBuy],
	];
	parts.forEach(([side, quantity], part) => {
		buffer.addData(DataType.Trade, symbol, {
			symbol,
			source: SourceType.Binance,
			market: MarketType.Crypto,
			timestamp: UnixTimestamp.of(closeTime - 1),
			price: Price.of(vwap),
			quantity: Volume.of(Math.max(0, quantity)),
			side,
			tradeId: BigInt(2 * idx + part + 1),
		});
	});
}

/** Market steps of `klines` as the trainer builds them from its buffer. */
function marketSteps(
	symbol: TradingSymbol,
	klines: Kline[],
	features: Options["features"]
): MarketStep[] {
	const buffer = new MarketDataBuffer({ maxSize: 2 * klines.length + 10 });
	klines.forEach((kline, idx) => {
		buffer.addData(DataType.Candle, symbol, toCandle(symbol, kline));
		if (features === "klines") {
			addTicker(buffer, symbol, klines, idx);
			addTrades(buffer, symbol, kline, idx);
		}
	});
	return buffer.buildMarketSteps(symbol);
}

function dayOfBars(klines: Kline[]): number {
	return Math.max(1, Math.round(DAY_MS / (klines[1][0] - klines[0][0])));
}

/** Mean over episodes of each bar's PnL. */
function meanBarPnl(pnlCurve: number[], bars: number): number[] {
	const episodes = pnlCurve.length / bars;
	return Array.from({ length: bars }, (_u, bar) => {
		let sum = 0;
		for (let ep = 0; ep < episodes; ep++) {
			sum += pnlCurve[ep * bars + bar];
		}
		return sum / episodes;
	});
}

async function runSegment(
	opts: Options,
	symbol: TradingSymbol,
	klines: Kline[],
	run: { segment: number; fitness: FitnessType; variant: string; seed: number }
): Promise<SegmentResult> {
	const observePosition = run.variant !== "hidden";
	const end = klines.length - (opts.segments - 1 - run.segment) * opts.test;
	const start = end - opts.test - opts.window;
	// One day of candles before the window, so that its first steps already
	// have a 24h ticker; their steps are dropped. Features are point in time
	// (ADR-0030): later candles never change an earlier step.
	const lead = Math.min(start, dayOfBars(klines));
	if (start - lead < 0) {
		throw new Error("not enough candles for these segments");
	}
	const steps = marketSteps(
		symbol,
		klines.slice(start - lead, end),
		opts.features
	).slice(Math.max(0, lead - 1));
	const trainSteps = steps.slice(0, -opts.test);
	const test = steps.slice(-opts.test);
	const split = Math.floor(trainSteps.length * 0.8);

	const t0 = Date.now();
	const { bestGenome } = await runInProcess(
		[
			{
				id: `${symbol}-${run.segment}`,
				train: trainSteps.slice(0, split),
				validation: trainSteps.slice(split),
			},
		],
		{
			validationSplit: 0.2,
			testSplit: 0,
			walkForwardFolds: 1,
			generations: opts.generations,
			populationSize: opts.population,
			timeBudgetMs: 3_600_000,
			episodesPerIndividual: 10,
			fitnessType: run.fitness,
			observePosition,
			seedOffset: run.seed,
		}
	);
	const trainSeconds = (Date.now() - t0) / 1000;

	const { episodePnl, pnlCurve } = evalPhase({
		genome: bestGenome,
		validationData: test,
		backendFactory: makeSeededBackendFactory(
			bestGenome.gaControl.seeding.networkSeed,
			{ observePosition }
		),
	});
	const closes = test.map((step) => Number(step.price));
	return {
		symbol,
		...run,
		features: opts.features,
		testFrom: new Date(Number(test[0].timestamp)).toISOString(),
		testTo: new Date(Number(test[test.length - 1].timestamp)).toISOString(),
		returnPct: (100 * mean(episodePnl)) / INITIAL_CASH,
		buyAndHoldPct: (100 * (closes[closes.length - 1] - closes[0])) / closes[0],
		barPnl: meanBarPnl(pnlCurve, test.length),
		closes,
		barsPerYear: barsPerYear(test) ?? 1,
		trainSeconds,
	};
}

function mean(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]): number {
	const mu = mean(values);
	return Math.sqrt(
		values.reduce((sum, value) => sum + (value - mu) ** 2, 0) /
			Math.max(1, values.length - 1)
	);
}

interface TrackRecord {
	sharpe: number;
	sortino: number;
	/** % of the initial cash per year (trades are sized on it, PnL adds up). */
	annualReturnPct: number;
	maxDrawdownPct: number;
	calmar: number;
}

/** Ratios of a chained out-of-sample PnL curve, annualised. */
function trackRecord(barPnl: number[], perYear: number): TrackRecord {
	const curve = new EpisodeScores(barPnl);
	const scale = Math.sqrt(perYear);
	const annualReturnPct =
		(100 * curve.total() * perYear) / barPnl.length / INITIAL_CASH;
	const maxDrawdownPct = (100 * curve.maxDrawdown()) / INITIAL_CASH;
	return {
		sharpe: curve.sharpe() * scale,
		sortino: curve.sortino() * scale,
		annualReturnPct,
		maxDrawdownPct,
		calmar:
			maxDrawdownPct > 1e-9
				? annualReturnPct / maxDrawdownPct
				: annualReturnPct > 0
					? Number.POSITIVE_INFINITY
					: 0,
	};
}

/** Buy and hold of the whole initial cash over the same test bars. */
function buyAndHoldPnl(closes: number[]): number[] {
	return closes.map((close, bar) =>
		bar === 0 ? 0 : (INITIAL_CASH * (close - closes[bar - 1])) / closes[0]
	);
}

const fmt = (value: number, digits = 2) =>
	Number.isFinite(value) ? value.toFixed(digits) : String(value);

function summariseGroup(rows: SegmentResult[], label: string): void {
	const symbols = [...new Set(rows.map((row) => row.symbol))];
	const seeds = [...new Set(rows.map((row) => row.seed))];
	const segments = new Set(rows.map((row) => row.segment)).size;
	const records: (TrackRecord & { symbol: string; seed: number })[] = [];
	const holds: Record<string, TrackRecord> = {};
	for (const symbol of symbols) {
		for (const seed of seeds) {
			const chain = rows
				.filter((row) => row.symbol === symbol && row.seed === seed)
				.sort((left, right) => left.segment - right.segment);
			if (chain.length === 0) {
				continue;
			}
			records.push({
				symbol,
				seed,
				...trackRecord(
					chain.flatMap((row) => row.barPnl),
					chain[0].barsPerYear
				),
			});
			holds[symbol] ??= trackRecord(
				chain.flatMap((row) => buyAndHoldPnl(row.closes)),
				chain[0].barsPerYear
			);
		}
	}
	// One return per (symbol, segment): mean over seeds, which share the data.
	const segmentReturns = symbols.flatMap((symbol) =>
		[...new Set(rows.map((row) => row.segment))].map((segment) =>
			mean(
				rows
					.filter((row) => row.symbol === symbol && row.segment === segment)
					.map((row) => row.returnPct)
			)
		)
	);
	const tStat =
		(mean(segmentReturns) / (std(segmentReturns) || 1e-12)) *
		Math.sqrt(segmentReturns.length);
	const sharpe = mean(records.map((rec) => rec.sharpe));
	const sortino = mean(records.map((rec) => rec.sortino));
	const calmar = mean(records.map((rec) => rec.calmar));
	const positiveShare =
		records.filter((rec) => rec.sharpe > 0).length / records.length;
	const beatsHold = symbols.every(
		(symbol) =>
			mean(
				records.filter((rec) => rec.symbol === symbol).map((rec) => rec.sharpe)
			) > holds[symbol].sharpe
	);

	console.log(`\n=== ${label} ===`);
	console.log(
		"symbol    seed  sharpe  sortino  annual%  maxDD%  calmar   (buy and hold: sharpe annual% maxDD%)"
	);
	for (const rec of records) {
		const hold = holds[rec.symbol];
		console.log(
			`${rec.symbol.padEnd(9)} ${String(rec.seed).padStart(4)} ${fmt(rec.sharpe).padStart(7)} ${fmt(rec.sortino).padStart(8)} ${fmt(rec.annualReturnPct).padStart(8)} ${fmt(rec.maxDrawdownPct).padStart(7)} ${fmt(rec.calmar).padStart(7)}   (${fmt(hold.sharpe)} ${fmt(hold.annualReturnPct)} ${fmt(hold.maxDrawdownPct)})`
		);
	}
	const check = (name: string, ok: boolean, detail: string) =>
		console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
	console.log(
		`\nADR-0030 criteria (${symbols.length} symbols, ${segments} segments, ${seeds.length} seeds; mean segment return ${fmt(mean(segmentReturns), 3)}%, buy and hold ${fmt(mean(rows.map((row) => row.buyAndHoldPct)), 3)}%):`
	);
	check(
		"protocol",
		symbols.length >= CRITERIA.minSymbols &&
			segments >= CRITERIA.minSegments &&
			seeds.length >= CRITERIA.minSeeds,
		`>= ${CRITERIA.minSymbols} symbols, ${CRITERIA.minSegments} segments, ${CRITERIA.minSeeds} seeds`
	);
	check(
		"Sharpe",
		sharpe >= CRITERIA.minSharpe,
		`${fmt(sharpe)} >= ${CRITERIA.minSharpe}`
	);
	check(
		"Sortino",
		sortino >= CRITERIA.minSortino,
		`${fmt(sortino)} >= ${CRITERIA.minSortino}`
	);
	check(
		"Calmar (annual return / max drawdown)",
		calmar >= CRITERIA.minCalmar,
		`${fmt(calmar)} >= ${CRITERIA.minCalmar}`
	);
	check(
		"significance",
		tStat >= CRITERIA.minTStat,
		`t = ${fmt(tStat)} >= ${CRITERIA.minTStat} over ${segmentReturns.length} segment returns`
	);
	check(
		"stability",
		positiveShare >= CRITERIA.minPositiveShare,
		`${fmt(100 * positiveShare, 0)}% of track records with Sharpe > 0 >= ${100 * CRITERIA.minPositiveShare}%`
	);
	check(
		"beats buy and hold",
		beatsHold,
		"mean Sharpe above buy and hold's on every symbol"
	);
	console.log(
		"OPEN  paper trading vs backtest gap: no paper-trading runner (ADR-0030)"
	);
}

function summarise(results: SegmentResult[]): void {
	const groups = new Map<string, SegmentResult[]>();
	for (const row of results) {
		const key = `fitness ${row.fitness}, ${row.variant}, ${row.features}`;
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}
	for (const [label, rows] of groups) {
		summariseGroup(rows, label);
	}
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.merge) {
		summarise(
			opts.merge.flatMap(
				(file) => JSON.parse(readFileSync(file, "utf8")) as SegmentResult[]
			)
		);
		return;
	}
	const results: SegmentResult[] = [];
	for (const file of opts.data) {
		const { symbol, klines } = JSON.parse(readFileSync(file, "utf8")) as {
			symbol: string;
			klines: Kline[];
		};
		if (opts.features === "klines" && klines[0].length < 10) {
			throw new Error(`${file}: no taker volumes, fetch it again`);
		}
		const sym = TradingSymbol.of(symbol);
		for (const fitness of opts.fitness) {
			for (
				let seed = opts.seedBase;
				seed < opts.seedBase + opts.seeds;
				seed++
			) {
				for (let segment = 0; segment < opts.segments; segment++) {
					for (const variant of opts.variants) {
						const row = await runSegment(opts, sym, klines, {
							segment,
							fitness,
							variant,
							seed,
						});
						results.push(row);
						const { barPnl: _bars, closes: _closes, ...line } = row;
						console.log(JSON.stringify(line));
						writeFileSync(opts.out, JSON.stringify(results));
					}
				}
			}
		}
	}
	summarise(results);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
