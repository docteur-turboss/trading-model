import { encodeGenome } from "../encoding";
import type { Genome } from "../genome-types";

function _computeL2Squared(va: Float32Array, vb: Float32Array): number {
	let l2sq = 0;
	for (let i = 0; i < va.length; i++) {
		const diff = va[i] - vb[i];
		l2sq += diff * diff;
	}
	return l2sq;
}

export function genomicDistance(left: Genome, right: Genome): number {
	const va = encodeGenome(left).toFloat32Array();
	const vb = encodeGenome(right).toFloat32Array();
	return Math.sqrt(_computeL2Squared(va, vb)) / Math.sqrt(va.length);
}
