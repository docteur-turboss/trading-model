import { encodeGenome } from "../encoding";
import type { Genome } from "../genome-types";

function _validateEncodingLength(va: Float32Array, vb: Float32Array): void {
	if (va.length !== vb.length) {
		throw new Error(
			`genomicDistance: encoded length mismatch (${va.length} vs ${vb.length})`
		);
	}
}

function _computeL2Squared(va: Float32Array, vb: Float32Array): number {
	let l2sq = 0;
	for (let i = 0; i < va.length; i++) {
		const diff = va[i] - vb[i];
		l2sq += diff * diff;
	}
	return l2sq;
}

export function genomicDistance(left: Genome, right: Genome): number {
	const va = encodeGenome(left);
	const vb = encodeGenome(right);
	_validateEncodingLength(va.toFloat32Array(), vb.toFloat32Array());
	return Math.sqrt(_computeL2Squared(va.toFloat32Array(), vb.toFloat32Array())) / Math.sqrt(va.length);
}
