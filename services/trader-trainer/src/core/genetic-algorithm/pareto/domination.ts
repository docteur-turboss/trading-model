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

function _comparePair(
	i: number,
	j: number,
	objectives: ObjectiveVector[],
	dominatedCount: Int32Array,
	dominateMap: number[][]
): void {
	if (dominates(objectives[i], objectives[j])) {
		dominateMap[i].push(j);
	} else if (dominates(objectives[j], objectives[i])) {
		dominatedCount[i]++;
	}
}

export function buildDominationMatrix(objectives: ObjectiveVector[]): {
	dominated: Int32Array;
	dominates: number[][];
} {
	const length = objectives.length;
	const dominated = new Int32Array(length);
	const dominates = Array.from({ length }, () => [] as number[]);

	for (let i = 0; i < length; i++) {
		for (let j = 0; j < length; j++) {
			if (i !== j) {
				_comparePair(i, j, objectives, dominated, dominates);
			}
		}
	}

	return { dominated, dominates };
}
