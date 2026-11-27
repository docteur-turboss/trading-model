/**
 * Hand-written multi-head self-attention over the analysts of one sector
 * (ADR-0076 §2, step 6). No tensor library: plain loops, groups of at most
 * `MAX_ATTENTION_TOKENS` tokens (the count² term dominates beyond).
 * Per head: Q = XWq, K = XWk, V = XWv, A = softmax(QKᵀ/√d), O = AV; the pooled
 * view is the mean over tokens of the concatenated heads, so it does not
 * depend on the order of the assets.
 */
export const MAX_ATTENTION_TOKENS = 100;

type Matrix = number[][];

/** Parameters of one head: Wq, Wk, Wv, each `dim × dim`, row-major, back to back. */
const headSize = (dim: number): number => 3 * dim * dim;

/** Number of weights of `heads` heads over tokens of `dim` fields. */
export const attentionParamCount = (heads: number, dim: number): number =>
	heads * headSize(dim);

const zeros = (rows: number, cols: number): Matrix =>
	Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

function project(
	tok: Matrix,
	wts: ArrayLike<number>,
	offset: number,
	dim: number
) {
	return tok.map((row) =>
		Array.from({ length: dim }, (_, col) =>
			row.reduce(
				(sum, val, key) => sum + val * wts[offset + key * dim + col],
				0
			)
		)
	);
}

interface HeadCache {
	qry: Matrix;
	key: Matrix;
	val: Matrix;
	att: Matrix;
}

/** What `attentionBackward` needs from the forward pass. */
export interface AttentionCache {
	tok: Matrix;
	heads: HeadCache[];
}

/** Pooled view (`heads × dim` values) and the cache for the backward pass. */
export function attentionForward(
	tok: Matrix,
	weights: ArrayLike<number>,
	heads: number
): { pooled: number[]; cache: AttentionCache } {
	const count = tok.length;
	const dim = tok[0]?.length ?? 0;
	if (count === 0 || count > MAX_ATTENTION_TOKENS) {
		throw new Error(`attention needs 1 to ${MAX_ATTENTION_TOKENS} tokens`);
	}
	if (weights.length !== attentionParamCount(heads, dim)) {
		throw new Error("attention weights do not match heads and token size");
	}
	const scale = 1 / Math.sqrt(dim);
	const cache: HeadCache[] = [];
	const pooled: number[] = [];
	for (let head = 0; head < heads; head++) {
		const base = head * headSize(dim);
		const qry = project(tok, weights, base, dim);
		const key = project(tok, weights, base + dim * dim, dim);
		const val = project(tok, weights, base + 2 * dim * dim, dim);
		const att = qry.map((qrow) => {
			const scores = key.map(
				(krow) =>
					qrow.reduce((sum, value, fld) => sum + value * krow[fld], 0) * scale
			);
			const top = Math.max(...scores);
			const exps = scores.map((sc) => Math.exp(sc - top));
			const total = exps.reduce((sum, ex) => sum + ex, 0);
			return exps.map((ex) => ex / total);
		});
		for (let fld = 0; fld < dim; fld++) {
			let sum = 0;
			for (let ti = 0; ti < count; ti++) {
				for (let tj = 0; tj < count; tj++) {
					sum += att[ti][tj] * val[tj][fld];
				}
			}
			pooled.push(sum / count);
		}
		cache.push({ qry, key, val, att });
	}
	return { pooled, cache: { tok, heads: cache } };
}

/** Gradients of the loss wts.rr.tt. the tokens and the weights, from `dPooled` (gradient of the pooled view). */
export function attentionBackward(
	cache: AttentionCache,
	weights: ArrayLike<number>,
	dPooled: ArrayLike<number>
): { gradX: Matrix; gradW: Float32Array } {
	const { tok } = cache;
	const count = tok.length;
	const dim = tok[0].length;
	const scale = 1 / Math.sqrt(dim);
	const gradX = zeros(count, dim);
	const gradW = new Float32Array(weights.length);
	cache.heads.forEach(({ qry, key, val, att }, head) => {
		const base = head * headSize(dim);
		// pooled[fld] = (1/count) Σ O[ti][fld], so gradO[ti][fld] = dPooled[fld] / count.
		const gradO = Array.from({ length: count }, () =>
			Array.from({ length: dim }, (_, fld) => dPooled[head * dim + fld] / count)
		);
		const gradQ = zeros(count, dim);
		const gradK = zeros(count, dim);
		const gradV = zeros(count, dim);
		for (let ti = 0; ti < count; ti++) {
			// gradA[ti][tj] = gradO[ti]·V[tj]; softmax Jacobian: gradS = A ∘ (gradA − Σ_j A·gradA).
			const gradA = val.map((vrow) =>
				gradO[ti].reduce((sum, value, fld) => sum + value * vrow[fld], 0)
			);
			const dotp = att[ti].reduce(
				(sum, value, tj) => sum + value * gradA[tj],
				0
			);
			for (let tj = 0; tj < count; tj++) {
				const gradS = att[ti][tj] * (gradA[tj] - dotp) * scale;
				for (let fld = 0; fld < dim; fld++) {
					gradQ[ti][fld] += gradS * key[tj][fld];
					gradK[tj][fld] += gradS * qry[ti][fld];
					gradV[tj][fld] += att[ti][tj] * gradO[ti][fld];
				}
			}
		}
		[gradQ, gradK, gradV].forEach((grad, which) => {
			const offset = base + which * dim * dim;
			for (let tt = 0; tt < count; tt++) {
				for (let rr = 0; rr < dim; rr++) {
					for (let cc = 0; cc < dim; cc++) {
						gradW[offset + rr * dim + cc] += tok[tt][rr] * grad[tt][cc];
						gradX[tt][rr] += grad[tt][cc] * weights[offset + rr * dim + cc];
					}
				}
			}
		});
	});
	return { gradX, gradW };
}
