export function makePRNG(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		let stateVal = state;
		stateVal |= 0;
		stateVal = (stateVal + 0x6d2b79f5) | 0;
		let temp = Math.imul(stateVal ^ (stateVal >>> 15), 1 | stateVal);
		temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp);
		state = stateVal;
		return ((temp ^ (temp >>> 14)) >>> 0) / 4_294_967_296;
	};
}
