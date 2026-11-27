import {
	attentionBackward,
	attentionForward,
	attentionParamCount,
} from "../src/attention";

const HEADS = 2;
const DIM = 3;
/** Central differences in float64 on a smooth loss: 1e-6 absolute is far above the rounding error and far below any wrong-Jacobian error. */
const TOLERANCE = 1e-6;
const EPS = 1e-5;

const tokens0 = [
	[0.3, -0.5, 0.8],
	[-0.2, 0.4, 0.1],
	[0.9, 0.7, -0.6],
	[0.05, -0.3, 0.45],
];
const weights = Float64Array.from(
	{ length: attentionParamCount(HEADS, DIM) },
	(_, i) => Math.sin(i + 1) * 0.7
);
const target = Array.from({ length: HEADS * DIM }, (_, i) => Math.cos(i));
// Loss = Σ target·pooled, so dPooled = target.
const loss = (tokens: number[][], w: ArrayLike<number>) =>
	attentionForward(tokens, w, HEADS).pooled.reduce(
		(sum, value, i) => sum + value * target[i],
		0
	);

describe("attention", () => {
	const { cache } = attentionForward(tokens0, weights, HEADS);
	const grads = attentionBackward(cache, weights, target);

	it("matches finite differences on the projection weights (softmax included)", () => {
		for (let i = 0; i < weights.length; i++) {
			const up = Float64Array.from(weights);
			const down = Float64Array.from(weights);
			up[i] += EPS;
			down[i] -= EPS;
			const numeric = (loss(tokens0, up) - loss(tokens0, down)) / (2 * EPS);
			expect(Math.abs(numeric - grads.gradW[i])).toBeLessThan(TOLERANCE);
		}
	});

	it("matches finite differences on the input tokens", () => {
		for (let t = 0; t < tokens0.length; t++) {
			for (let f = 0; f < DIM; f++) {
				const up = tokens0.map((row) => [...row]);
				const down = tokens0.map((row) => [...row]);
				up[t][f] += EPS;
				down[t][f] -= EPS;
				const numeric = (loss(up, weights) - loss(down, weights)) / (2 * EPS);
				expect(Math.abs(numeric - grads.gradX[t][f])).toBeLessThan(TOLERANCE);
			}
		}
	});

	it("does not depend on the order of the tokens", () => {
		const shuffled = [tokens0[2], tokens0[0], tokens0[3], tokens0[1]];
		const a = attentionForward(tokens0, weights, HEADS).pooled;
		const b = attentionForward(shuffled, weights, HEADS).pooled;
		for (const [idx, value] of b.entries()) {
			expect(value).toBeCloseTo(a[idx], 10);
		}
	});

	it("refuses mismatched weights and oversized groups", () => {
		expect(() =>
			attentionForward(tokens0, weights.subarray(1), HEADS)
		).toThrow();
		expect(() =>
			attentionForward(
				Array.from({ length: 101 }, () => [0, 0, 0]),
				weights,
				HEADS
			)
		).toThrow();
	});
});
