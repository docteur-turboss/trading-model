import { describe, expect, it } from "@jest/globals";
import { Cash, Price } from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome-types";
import type {
	RLBackend,
	Transition,
} from "../../../src/domain/genetic-algorithm/rl-backend";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";
import { trainPhase } from "../../../src/domain/genetic-algorithm/training-phase";

/** Bar i carries feature [i]; the backend plays action i % 3 at bar i. */
const DATA = Array.from({ length: 5 }, (_u, idx) => ({
	features: FeatureVector.fromFloat32Array(new Float32Array([idx])),
	price: Price.of(100),
}));

/**
 * A backend whose decision at bar i earns `earned[i]`, paid (like the real
 * agent) at the next step.
 */
function recordingBackend(earned: number[]) {
	const stored: Transition[] = [];
	const replays: [number, number][] = [];
	let bar = 0;
	const backend: RLBackend = {
		forwardPass: () => new Float32Array(3),
		step: ({ features }) => {
			const reward = bar === 0 ? 0 : earned[bar - 1];
			return {
				reward,
				action: bar++ % 3,
				state: features.toFloat32Array(),
			};
		},
		remember: (transition) => stored.push(transition),
		replay: (batchSize, discount) => replays.push([batchSize, discount]),
		getWeights: () => new Float32Array(0),
		setWeights: () => undefined,
		getPnL: () => Cash.of(0),
		resetEpisode: () => undefined,
	};
	return { backend, stored, replays };
}

function genomeWith(rl: {
	gamma?: number;
	nStepReturn?: number;
	sparse?: boolean;
}): DeepReadonly<LamarckGenome> {
	const base = createDefaultGenome("g0_0");
	return {
		...base,
		rl: {
			...base.rl,
			gamma: rl.gamma ?? 0.5,
			horizon: { ...base.rl.horizon, nStepReturn: rl.nStepReturn ?? 1 },
			rewardShaping: {
				...base.rl.rewardShaping,
				sparse: rl.sparse ?? false,
			},
		},
	} as DeepReadonly<LamarckGenome>;
}

const bar = (transition: Transition) => transition.state[0];
const next = (transition: Transition) => transition.nextState[0];

describe("trainPhase", () => {
	it("stores each decision with the action it played and the reward it earned", () => {
		const { backend, stored } = recordingBackend([1, 2, 3, 4, 5]);

		trainPhase({ backend, trainData: DATA, genome: genomeWith({}) });

		expect(stored.map(bar)).toEqual([0, 1, 2, 3]);
		expect(stored.map((t) => t.action)).toEqual([0, 1, 2, 0]);
		expect(stored.map((t) => t.reward)).toEqual([1, 2, 3, 4]);
		expect(stored.map(next)).toEqual([1, 2, 3, 4]);
	});

	it("treats the end of the window as a truncation, not a terminal state", () => {
		const { backend, stored } = recordingBackend([1, 2, 3, 4, 5]);

		trainPhase({ backend, trainData: DATA, genome: genomeWith({}) });

		// the last decision, which no price follows, is never stored
		expect(stored.map(bar)).not.toContain(4);
		expect(stored.every((t) => !t.done)).toBe(true);
	});

	it("sums n rewards discounted by gamma and bootstraps n bars later", () => {
		const { backend, stored } = recordingBackend([1, 2, 3, 4, 5]);

		trainPhase({
			backend,
			trainData: DATA,
			genome: genomeWith({ gamma: 0.5, nStepReturn: 2 }),
		});

		expect(stored[0]).toMatchObject({ reward: 1 + 0.5 * 2, done: false });
		expect(next(stored[0])).toBe(2);
		// decision 3 would need the reward of decision 4, which never comes
		expect(stored.map(bar)).toEqual([0, 1, 2]);
		expect(stored.at(-1)).toMatchObject({ reward: 3 + 0.5 * 4 });
	});

	it("gives a sparse genome the episode total on its last transition only", () => {
		const { backend, stored } = recordingBackend([1, 2, 3, 4, 5]);

		trainPhase({
			backend,
			trainData: DATA,
			genome: genomeWith({ sparse: true }),
		});

		expect(stored.map((t) => t.reward)).toEqual([0, 0, 0, 10]);
		expect(stored.map((t) => t.done)).toEqual([false, false, false, true]);
	});

	it("replays a batch of the genome's size, discounted by gamma^n, after each store", () => {
		const { backend, stored, replays } = recordingBackend([1, 2, 3, 4, 5]);
		const genome = genomeWith({ gamma: 0.5, nStepReturn: 2 });

		trainPhase({ backend, trainData: DATA, genome });

		expect(replays).toHaveLength(stored.length);
		expect(replays[0]).toEqual([genome.rl.replayBuffer.batchSize, 0.25]);
	});
});
