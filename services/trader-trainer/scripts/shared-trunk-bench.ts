/**
 * Measures ADR-0076 step 1 (FEATURE_SHARED_TRUNK) on real candles
 * (scripts/fetch-klines.ts): per seed, the real GA trains each symbol alone,
 * then once on the whole group (one shared trunk, one head per symbol), on the
 * same window of `window` candles; every model is scored on the next `test`
 * candles, which no training saw (ADR-0068). Seeds and data are paired.
 *
 *   bun scripts/shared-trunk-bench.ts --data a.json,b.json,... --out seed0.json [--seed 0] [--k <symbols per generation, default all>]
 *     [--window 500] [--test 1500: ADR-0069 needs 1440 bars] [--population 20] [--generations 30]
 *     [--passes 1: timed passes per seed, the verdict reads the median time, the table shows the spread]
 *   bun scripts/shared-trunk-bench.ts --merge seed0.json,seed1.json,seed2.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { runInProcess } from "../src/application/training-session";
import { evalPhase } from "../src/domain/genetic-algorithm/evaluation-phase";
import type { MarketStep } from "../src/domain/genetic-algorithm/genome";
import { FitnessType } from "../src/domain/genetic-algorithm/genome-control";
import { makeSeededBackendFactory } from "../src/domain/genetic-algorithm/rl-backend";
import { weightsOf } from "../src/domain/genetic-algorithm/shared-trunk";
import { EMBARGO_STEPS } from "../src/domain/market-data/window-splitter";
import { assessAdmission } from "../src/domain/model-admission";
import { type Kline, marketSteps } from "./mt4-walk-forward";

const INITIAL_CASH = 1000;
/** Tolerance on the median test fitness and share of the cost of 10 sessions (ADR-0076 section 9). */
const FITNESS_TOLERANCE = 0.05;
const TIME_SHARE = 1 / 3;

interface SeedResult {
	seed: number;
	symbols: string[];
	/** Mean test PnL of each symbol, % of the initial cash. */
	single: number[];
	group: number[];
	/** ADR-0069 verdict per symbol (the trainer's `assessAdmission`); null: test segment too short for one. */
	singleAdmissible: (boolean | null)[];
	groupAdmissible: (boolean | null)[];
	/** Seconds of each timed pass (same seed, same data, same models). */
	singleSeconds: number[];
	groupSeconds: number[];
}

const arg = (name: string, fallback?: string): string => {
	const idx = process.argv.indexOf(`--${name}`);
	const value = idx >= 0 ? process.argv[idx + 1] : fallback;
	if (value === undefined) {
		throw new Error(`missing --${name}`);
	}
	return value;
};
const median = (values: number[]) => {
	const sorted = [...values].sort((left, right) => left - right);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function measure(seed: number): Promise<SeedResult> {
	const window = Number(arg("window", "500"));
	const test = Number(arg("test", "1500"));
	const settings = {
		validationSplit: 0.2,
		testSplit: 0,
		walkForwardFolds: 1,
		generations: Number(arg("generations", "30")),
		populationSize: Number(arg("population", "20")),
		timeBudgetMs: 3_600_000,
		episodesPerIndividual: 10,
		fitnessType: FitnessType.TotalPnl,
		seedOffset: seed,
	};
	const sets = arg("data")
		.split(",")
		.map((file) => {
			const data = JSON.parse(readFileSync(file, "utf8")) as {
				symbol: string;
				klines: Kline[];
			};
			const steps = marketSteps(
				TradingSymbol.of(data.symbol),
				data.klines.slice(-(window + test))
			);
			const train = steps.slice(0, -test);
			const split = Math.floor(train.length * 0.8);
			return {
				id: data.symbol,
				symbol: data.symbol,
				train: train.slice(0, split),
				validation: train.slice(split + EMBARGO_STEPS),
				test: steps.slice(-test + EMBARGO_STEPS),
			};
		});
	const score = (genome: never, steps: MarketStep[]) => {
		const { episodePnl } = evalPhase({
			genome,
			validationData: steps,
			backendFactory: makeSeededBackendFactory(
				(genome as { gaControl: { seeding: { networkSeed: number } } })
					.gaControl.seeding.networkSeed
			),
		});
		return (
			(100 * episodePnl.reduce((sum, value) => sum + value, 0)) /
			episodePnl.length /
			INITIAL_CASH
		);
	};

	const singleSeconds: number[] = [];
	const groupSeconds: number[] = [];
	let single: number[] = [];
	let singleAdmissible: (boolean | null)[] = [];
	let group: number[] = [];
	let groupAdmissible: (boolean | null)[] = [];
	for (let pass = 0; pass < Number(arg("passes", "1")); pass++) {
		let t0 = Date.now();
		single = [];
		singleAdmissible = [];
		for (const { symbol: _s, ...window } of sets) {
			// the test segment goes through the session, as in the trainer, for its test metrics
			const { bestGenome, bestFitnessMeta } = await runInProcess(
				[window],
				settings
			);
			single.push(score(bestGenome as never, window.test));
			singleAdmissible.push(
				assessAdmission(bestFitnessMeta, window.test)?.admissible ?? null
			);
		}
		singleSeconds.push((Date.now() - t0) / 1000);

		t0 = Date.now();
		const { bestGenome, symbols } = await runInProcess(sets, {
			...settings,
			symbolsPerGeneration: Number(arg("k", String(sets.length))),
		});
		groupSeconds.push((Date.now() - t0) / 1000);
		group = sets.map((ws) =>
			score(
				{
					...bestGenome,
					trainedWeights: weightsOf(bestGenome, ws.symbol),
				} as never,
				ws.test
			)
		);
		groupAdmissible = sets.map(
			(ws) =>
				assessAdmission(symbols?.[ws.symbol]?.bestFitnessMeta, ws.test)
					?.admissible ?? null
		);
	}
	return {
		seed,
		symbols: sets.map((ws) => ws.symbol),
		single,
		group,
		singleAdmissible,
		groupAdmissible,
		singleSeconds,
		groupSeconds,
	};
}

/** Median group / per-symbol time ratio of a seed, and the lowest and highest ratio over its passes. */
const timeRatio = (row: SeedResult) => {
	const ratios = row.groupSeconds.map(
		(time, pass) => time / row.singleSeconds[pass]
	);
	return {
		median: median(row.groupSeconds) / median(row.singleSeconds),
		min: Math.min(...ratios),
		max: Math.max(...ratios),
	};
};

function summarise(results: SeedResult[]): void {
	console.log(
		"| graine | fitness test par symbole (médiane, %) | fitness test tronc partagé (médiane, %) | écart | temps 10 sessions (s, médiane) | temps session de groupe (s, médiane) | rapport (médiane, min à max sur les passages) | admissibles par symbole / tronc partagé |"
	);
	console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
	for (const row of results) {
		const single = median(row.single);
		const shared = median(row.group);
		const ratio = timeRatio(row);
		console.log(
			`| ${row.seed} | ${single.toFixed(3)} | ${shared.toFixed(3)} | ${(shared - single).toFixed(3)} | ${median(row.singleSeconds).toFixed(0)} | ${median(row.groupSeconds).toFixed(0)} | ${ratio.median.toFixed(2)} (${ratio.min.toFixed(2)} à ${ratio.max.toFixed(2)}) | ${row.singleAdmissible.filter(Boolean).length} / ${row.groupAdmissible.filter(Boolean).length} (sur ${row.symbols.length}) |`
		);
	}
	const single = median(results.map((row) => median(row.single)));
	const shared = median(results.map((row) => median(row.group)));
	const ratio = median(results.map((row) => timeRatio(row).median));
	const admitted = (pick: (row: SeedResult) => (boolean | null)[]) =>
		results.flatMap(pick).filter(Boolean).length;
	const singleAdmitted = admitted((row) => row.singleAdmissible);
	const sharedAdmitted = admitted((row) => row.groupAdmissible);
	const verdictKnown = results.every((row) =>
		[...row.singleAdmissible, ...row.groupAdmissible].every(
			(verdict) => verdict !== null
		)
	);
	// 0 admissible on both sides tells nothing: inconclusive, never "not worse"
	const conclusive = verdictKnown && singleAdmitted + sharedAdmitted > 0;
	const admissionOk = conclusive && sharedAdmitted >= singleAdmitted;
	const fitnessOk = shared >= single - FITNESS_TOLERANCE * Math.abs(single);
	const timeOk = ratio <= TIME_SHARE;
	console.log(
		`\n${results.length} graines, ${results[0].symbols.length} symboles. Médiane des graines: fitness ${single.toFixed(3)} % contre ${shared.toFixed(3)} % (à 5 % près: ${fitnessOk ? "oui" : "non"}), temps ${ratio.toFixed(2)} de 10 sessions (au plus ${TIME_SHARE.toFixed(2)}: ${timeOk ? "oui" : "non"}), modèles admissibles ${singleAdmitted} contre ${sharedAdmitted} (ADR-0069, pas pire: ${admissionOk ? "oui" : conclusive ? "non" : verdictKnown ? "non concluant: aucun modèle admissible" : "segment de test trop court"}).`
	);
	console.log(
		`Critère ADR-0076 étape 1 : ${fitnessOk && timeOk && admissionOk && results.length >= 3 ? "atteint" : "non atteint"}`
	);
}

if (process.argv.includes("--merge")) {
	summarise(
		arg("merge")
			.split(",")
			.map((file) => JSON.parse(readFileSync(file, "utf8")) as SeedResult)
	);
} else {
	measure(Number(arg("seed", "0")))
		.then((result) => writeFileSync(arg("out"), JSON.stringify(result)))
		.catch((err: unknown) => {
			console.error(err);
			process.exit(1);
		});
}
