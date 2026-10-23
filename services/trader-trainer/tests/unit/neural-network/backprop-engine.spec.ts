import { describe, expect, it } from "@jest/globals";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { makePRNG } from "../../../src/domain/genetic-algorithm/prng";
import { BackpropEngine } from "../../../src/domain/neural-network/backprop-engine";
import { FeedForwardEngine } from "../../../src/domain/neural-network/feed-forward-engine";
import { NeuralNetworkBuilder } from "../../../src/domain/neural-network/neural-network-builder";
import type { NnTrainingDeps } from "../../../src/domain/neural-network/nn-training-deps";
import {
	ActivationType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
	OptimizerType,
} from "../../../src/domain/neural-network/type";

interface LayerParams {
	weights: number[];
	bias: number[];
}

interface Net {
	deps: NnTrainingDeps;
	forward: FeedForwardEngine;
	backprop: BackpropEngine;
}

function buildNet(
	neuronsByLayer: number[],
	activationType: ActivationType[],
	options: { learningRate?: number; gradientClipNorm?: number } = {}
): Net {
	const deps = NeuralNetworkBuilder.build({
		neuronsByLayer: neuronsByLayer as PositiveInt[],
		activationType,
		initialisationType: InitialisationType.Xavier,
		biasInitialisationType: InitialisationType.Xavier,
		lossFunctionType: LossFunctionType.MeanSquaredError,
		normalisationType: NormalisationType.None,
		optimizerType: OptimizerType.Sgd,
		learningRate: (options.learningRate ?? 0) as never,
		gradientClipNorm: options.gradientClipNorm ?? 0,
		enablePool: false,
		rng: makePRNG(11),
	});
	return {
		deps,
		forward: new FeedForwardEngine(deps.config, deps.layers),
		backprop: new BackpropEngine(deps),
	};
}

function setParams(net: Net, params: LayerParams[]): void {
	params.forEach((layer, idx) => {
		net.deps.layers[idx].weights.set(layer.weights);
		net.deps.layers[idx].bias.set(layer.bias);
	});
}

function snapshot(net: Net): LayerParams[] {
	return net.deps.layers.map((layer) => ({
		weights: [...layer.weights],
		bias: [...layer.bias],
	}));
}

function lossAt(net: Net, input: Float32Array, target: Float32Array): number {
	return net.backprop.computeLoss(net.forward.forward(input).output, target);
}

function backpropOnce(
	net: Net,
	input: Float32Array,
	target: Float32Array
): void {
	net.backprop.backprop(net.forward.forward(input), target);
}

function expectCloseArray(actual: ArrayLike<number>, expected: number[]): void {
	expect(actual).toHaveLength(expected.length);
	expected.forEach((value, idx) => {
		expect(actual[idx]).toBeCloseTo(value, 5);
	});
}

/**
 * 2 → 2 (sigmoid) → 1 (linear), MSE, x = [1, 2], t = 1.
 *   z₀ = W₀x + b₀ = [0.5, −0.4]          h = σ(z₀) = [0.62245933, 0.40131234]
 *   y  = W₁h + b₁ = 0.27044226            ∂L/∂y = 2(y − t) = −1.45911548
 *   δ₁ = ∂L/∂y · 1                        (linear output)
 *   δ₀ = δ₁ · W₁ ⊙ h(1 − h) = [−0.17144878, 0.21034090]
 *   ∂L/∂W = δ ⊗ input,  ∂L/∂b = δ
 */
const TINY_PARAMS: LayerParams[] = [
	{ weights: [0.1, 0.2, 0.3, -0.4], bias: [0, 0.1] },
	{ weights: [0.5, -0.6], bias: [0.2] },
];
const TINY_INPUT = new Float32Array([1, 2]);
const TINY_TARGET = new Float32Array([1]);

function buildTinyNet(
	options: { learningRate?: number; gradientClipNorm?: number } = {}
): Net {
	const net = buildNet(
		[2, 2, 1],
		[ActivationType.Sigmoid, ActivationType.Linear],
		options
	);
	setParams(net, TINY_PARAMS);
	return net;
}

describe("BackpropEngine", () => {
	describe("known values on a 2 → 2 → 1 network", () => {
		it("should compute the forward pass and the MSE loss", () => {
			const net = buildTinyNet();
			const { output, layerOutputs } = net.forward.forward(TINY_INPUT);

			expectCloseArray(layerOutputs[0], [0.62245933, 0.40131234]);
			expectCloseArray(output, [0.27044226]);
			expect(lossAt(net, TINY_INPUT, TINY_TARGET)).toBeCloseTo(0.53225449, 5);
		});

		it("should produce the output delta and its gradients", () => {
			const net = buildTinyNet();

			backpropOnce(net, TINY_INPUT, TINY_TARGET);

			const output = net.deps.layers[1];
			expectCloseArray(output.gradB, [-1.45911548]);
			expectCloseArray(output.gradW, [-0.90824004, -0.58556105]);
		});

		it("should back-propagate the hidden deltas and their gradients", () => {
			const net = buildTinyNet();

			backpropOnce(net, TINY_INPUT, TINY_TARGET);

			const hidden = net.deps.layers[0];
			expectCloseArray(hidden.gradB, [-0.17144878, 0.2103409]);
			expectCloseArray(
				hidden.gradW,
				[-0.17144878, -0.34289755, 0.2103409, 0.42068181]
			);
		});

		it("should apply one SGD step of −lr·∇L to every parameter", () => {
			const net = buildTinyNet({ learningRate: 0.1 });

			backpropOnce(net, TINY_INPUT, TINY_TARGET);

			const [hidden, output] = snapshot(net);
			expectCloseArray(output.weights, [0.5 + 0.090824, -0.6 + 0.0585561]);
			expectCloseArray(output.bias, [0.2 + 0.14591155]);
			expectCloseArray(hidden.bias, [0 + 0.01714488, 0.1 - 0.02103409]);
		});

		it("should not carry the previous sample's weight gradient into the next one", () => {
			const net = buildTinyNet();

			backpropOnce(net, TINY_INPUT, TINY_TARGET);
			backpropOnce(net, TINY_INPUT, TINY_TARGET);

			expectCloseArray(net.deps.layers[1].gradW, [-0.90824004, -0.58556105]);
			expectCloseArray(
				net.deps.layers[0].gradW,
				[-0.17144878, -0.34289755, 0.2103409, 0.42068181]
			);
		});

		it("should clip each layer delta to the configured norm", () => {
			const net = buildTinyNet({ gradientClipNorm: 0.5 });

			backpropOnce(net, TINY_INPUT, TINY_TARGET);

			expectCloseArray(net.deps.layers[1].gradB, [-0.5]);
		});
	});

	describe("finite-difference gradient check", () => {
		const EPS = 1e-3;
		const TOPOLOGIES: Array<{
			name: string;
			sizes: number[];
			activations: ActivationType[];
		}> = [
			{
				name: "2 → 2 → 1 sigmoid/linear",
				sizes: [2, 2, 1],
				activations: [ActivationType.Sigmoid, ActivationType.Linear],
			},
			{
				name: "3 → 4 → 2 tanh/linear",
				sizes: [3, 4, 2],
				activations: [ActivationType.Tanh, ActivationType.Linear],
			},
			{
				name: "3 → 4 → 3 → 2 tanh/sigmoid/linear",
				sizes: [3, 4, 3, 2],
				activations: [
					ActivationType.Tanh,
					ActivationType.Sigmoid,
					ActivationType.Linear,
				],
			},
		];

		function numericalGradient(
			net: Net,
			params: Float32Array,
			idx: number,
			sample: { input: Float32Array; target: Float32Array }
		): number {
			const original = params[idx];
			params[idx] = original + EPS;
			const lossPlus = lossAt(net, sample.input, sample.target);
			params[idx] = original - EPS;
			const lossMinus = lossAt(net, sample.input, sample.target);
			params[idx] = original;
			return (lossPlus - lossMinus) / (2 * EPS);
		}

		it.each(TOPOLOGIES)("$name: analytic ∇L matches (L(w+ε) − L(w−ε)) / 2ε", ({
			sizes,
			activations,
		}) => {
			const net = buildNet(sizes, activations);
			const rng = makePRNG(3);
			const sample = {
				input: Float32Array.from({ length: sizes[0] }, () => rng() * 2 - 1),
				target: Float32Array.from(
					{ length: sizes[sizes.length - 1] },
					() => rng() * 2 - 1
				),
			};

			backpropOnce(net, sample.input, sample.target);

			for (const layer of net.deps.layers) {
				const pairs: [Float32Array, Float32Array][] = [
					[layer.weights, layer.gradW],
					[layer.bias, layer.gradB],
				];
				for (const [params, grads] of pairs) {
					for (let idx = 0; idx < params.length; idx++) {
						const numeric = numericalGradient(net, params, idx, sample);
						expect(Math.abs(grads[idx] - numeric)).toBeLessThan(
							1e-3 * Math.max(1, Math.abs(numeric))
						);
					}
				}
			}
		});
	});

	describe("accumulated mini-batch", () => {
		const SAMPLES = [
			{ input: [1, 2], target: [1] },
			{ input: [-0.5, 0.3], target: [-0.2] },
			{ input: [0.8, -1.1], target: [0.4] },
		].map(({ input, target }) => ({
			input: new Float32Array(input),
			target: new Float32Array(target),
		}));
		const LR = 0.1;

		function meanGradientStep(): LayerParams[] {
			const sums = TINY_PARAMS.map(({ weights, bias }) => ({
				weights: new Array<number>(weights.length).fill(0),
				bias: new Array<number>(bias.length).fill(0),
			}));
			for (const sample of SAMPLES) {
				const probe = buildTinyNet();
				backpropOnce(probe, sample.input, sample.target);
				probe.deps.layers.forEach((layer, idx) => {
					layer.gradW.forEach((grad, k) => {
						sums[idx].weights[k] += grad;
					});
					layer.gradB.forEach((grad, k) => {
						sums[idx].bias[k] += grad;
					});
				});
			}
			return TINY_PARAMS.map(({ weights, bias }, idx) => ({
				weights: weights.map(
					(w, k) => w - (LR * sums[idx].weights[k]) / SAMPLES.length
				),
				bias: bias.map((b, k) => b - (LR * sums[idx].bias[k]) / SAMPLES.length),
			}));
		}

		function accumulatedStep(net: Net): void {
			for (const sample of SAMPLES) {
				net.backprop.backpropAccumulate(
					net.forward.forward(sample.input),
					sample.target
				);
			}
			net.backprop.applyAccumulatedGradients(SAMPLES.length);
		}

		it("should step by −lr · mean of the per-sample gradients", () => {
			const net = buildTinyNet({ learningRate: LR });

			accumulatedStep(net);

			snapshot(net).forEach((layer, idx) => {
				const expected = meanGradientStep()[idx];
				expectCloseArray(layer.weights, expected.weights);
				expectCloseArray(layer.bias, expected.bias);
			});
		});

		it("should not touch the parameters before the batch is applied", () => {
			const net = buildTinyNet({ learningRate: LR });

			for (const sample of SAMPLES) {
				net.backprop.backpropAccumulate(
					net.forward.forward(sample.input),
					sample.target
				);
			}

			expect(snapshot(net)).toEqual(snapshot(buildTinyNet()));
		});

		it("should start the next batch from cleared accumulators", () => {
			const net = buildTinyNet({ learningRate: LR });
			accumulatedStep(net);
			const afterFirst = snapshot(net);

			net.backprop.backpropAccumulate(
				net.forward.forward(SAMPLES[0].input),
				SAMPLES[0].target
			);
			net.backprop.applyAccumulatedGradients(1);

			const reference = buildTinyNet({ learningRate: LR });
			afterFirst.forEach((layer, idx) => {
				reference.deps.layers[idx].weights.set(layer.weights);
				reference.deps.layers[idx].bias.set(layer.bias);
			});
			backpropOnce(reference, SAMPLES[0].input, SAMPLES[0].target);
			expect(snapshot(net)).toEqual(snapshot(reference));
		});

		it("should ignore an empty batch", () => {
			const net = buildTinyNet({ learningRate: LR });

			net.backprop.applyAccumulatedGradients(0);

			expect(snapshot(net)).toEqual(snapshot(buildTinyNet()));
		});

		it("should discard pending gradients on reset", () => {
			const net = buildTinyNet({ learningRate: LR });
			net.backprop.backpropAccumulate(
				net.forward.forward(SAMPLES[0].input),
				SAMPLES[0].target
			);

			net.backprop.resetAccumulators();

			for (const layer of net.deps.layers) {
				expect([...layer.accumGradW].every((g) => g === 0)).toBe(true);
				expect([...layer.accumGradB].every((g) => g === 0)).toBe(true);
			}
		});
	});
});
