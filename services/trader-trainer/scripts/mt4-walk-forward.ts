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
 *     [--variants shown] [--seeds 3] [--seed-base 0]
 *   bun scripts/mt4-walk-forward.ts --merge a.json,b.json   # summary only
 *
 * Variants: `shown` / `hidden` = the agent sees its position or a constant
 * (ADR-0025). The only features are the candles'
 * (ADR-0078).
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
	type CandleData,
	CandleInterval,
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import { EpisodeScores } from "@trading-model/model-runtime/episode-scores";
import { barsPerYear } from "@trading-model/model-runtime/replay-metrics";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import { runInProcess } from "../src/application/training-session";
import { evalPhase } from "../src/domain/genetic-algorithm/evaluation-phase";
import type { MarketStep } from "../src/domain/genetic-algorithm/genome";
import { FitnessType } from "../src/domain/genetic-algorithm/genome-control";
import {
	makeSeededBackendFactory,
	SIMULATOR_PARAMS,
} from "../src/domain/genetic-algorithm/rl-backend";
import { EMBARGO_STEPS } from "../src/domain/market-data/window-splitter";
import { MarketDataBuffer } from "../src/domain/market-data-buffer";
import { ADMISSION_THRESHOLDS } from "../src/domain/model-admission";
import { arg, mean, splitTrainValidation } from "./common";

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
export type Kline = number[];

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
	merge?: string[];
}

interface SegmentResult {
	symbol: string;
	segment: number;
	fitness: string;
	variant: string;
	seed: number;
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
	const merge = argv.includes("--merge")
		? arg("merge", undefined, argv).split(",")
		: undefined;
	return {
		data: merge ? [] : arg("data", undefined, argv).split(","),
		out: merge ? "" : arg("out", undefined, argv),
		segments: Number(arg("segments", "12", argv)),
		window: Number(arg("window", "500", argv)),
		test: Number(arg("test", "100", argv)),
		population: Number(arg("population", "20", argv)),
		generations: Number(arg("generations", "30", argv)),
		fitness: arg("fitness", FitnessType.TotalPnl, argv).split(
			","
		) as FitnessType[],
		variants: arg("variants", "shown", argv).split(","),
		seeds: Number(arg("seeds", "3", argv)),
		seedBase: Number(arg("seed-base", "0", argv)),
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

/** Market steps of `klines` as the trainer builds them from its buffer. */
export function marketSteps(
	symbol: TradingSymbol,
	klines: Kline[]
): MarketStep[] {
	const buffer = new MarketDataBuffer({ maxSize: 2 * klines.length + 10 });
	for (const kline of klines) {
		buffer.addCandle(symbol, toCandle(symbol, kline));
	}
	return buffer.buildMarketSteps(symbol);
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
	if (start < 0) {
		throw new Error("not enough candles for these segments");
	}
	// Features are point in time (ADR-0030): later candles never change an earlier step.
	const steps = marketSteps(symbol, klines.slice(start, end));
	const trainSteps = steps.slice(0, -opts.test);
	if (opts.test <= EMBARGO_STEPS) {
		throw new Error(`test must exceed the ${EMBARGO_STEPS}-step embargo`);
	}
	const test = steps.slice(-opts.test + EMBARGO_STEPS);

	const t0 = Date.now();
	const { bestGenome } = await runInProcess(
		[
			{
				id: `${symbol}-${run.segment}`,
				...splitTrainValidation(trainSteps),
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
		testFrom: new Date(Number(test[0].timestamp)).toISOString(),
		testTo: new Date(Number(test[test.length - 1].timestamp)).toISOString(),
		returnPct: (100 * mean(episodePnl)) / SIMULATOR_PARAMS.initialCash,
		buyAndHoldPct: (100 * (closes[closes.length - 1] - closes[0])) / closes[0],
		barPnl: meanBarPnl(pnlCurve, test.length),
		closes,
		barsPerYear: barsPerYear(test) ?? 1,
		trainSeconds,
	};
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
		(100 * curve.total() * perYear) /
		barPnl.length /
		SIMULATOR_PARAMS.initialCash;
	const maxDrawdownPct =
		(100 * curve.maxDrawdown()) / SIMULATOR_PARAMS.initialCash;
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
		bar === 0
			? 0
			: (SIMULATOR_PARAMS.initialCash * (close - closes[bar - 1])) / closes[0]
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
		const key = `fitness ${row.fitness}, ${row.variant}`;
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

if (require.main === module) {
	main().catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
}
