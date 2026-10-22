export interface ObjectiveVector {
	avgPnl: number;
	sharpe: number;
	negFlops: number;
}

export function dominates(
	first: ObjectiveVector,
	second: ObjectiveVector
): boolean {
	return (
		first.avgPnl >= second.avgPnl &&
		first.sharpe >= second.sharpe &&
		first.negFlops >= second.negFlops &&
		(first.avgPnl > second.avgPnl ||
			first.sharpe > second.sharpe ||
			first.negFlops > second.negFlops)
	);
}

interface DominationState {
	objectives: ObjectiveVector[];
	dominatedCount: Int32Array;
	dominateMap: number[][];
}

function _comparePair(idx: number, jdx: number, state: DominationState): void {
	if (dominates(state.objectives[idx], state.objectives[jdx])) {
		state.dominateMap[idx].push(jdx);
	} else if (dominates(state.objectives[jdx], state.objectives[idx])) {
		state.dominatedCount[idx]++;
	}
}

export function buildDominationMatrix(objectives: ObjectiveVector[]): {
	dominated: Int32Array;
	dominates: number[][];
} {
	const length = objectives.length;
	const dominated = new Int32Array(length);
	const dominates = Array.from({ length }, () => [] as number[]);
	const state: DominationState = {
		objectives,
		dominatedCount: dominated,
		dominateMap: dominates,
	};

	for (let i = 0; i < length; i++) {
		for (let j = 0; j < length; j++) {
			if (i !== j) {
				_comparePair(i, j, state);
			}
		}
	}

	return { dominated, dominates };
}
