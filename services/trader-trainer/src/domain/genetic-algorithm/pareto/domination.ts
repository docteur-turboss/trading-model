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

export function buildDominationMatrix(objectives: ObjectiveVector[]): {
	dominated: Int32Array;
	dominates: number[][];
} {
	const length = objectives.length;
	const dominated = new Int32Array(length);
	const dominatesList = Array.from({ length }, () => [] as number[]);

	// Each pair once: every dominates list still fills in ascending index order.
	for (let i = 0; i < length; i++) {
		for (let j = i + 1; j < length; j++) {
			if (dominates(objectives[i], objectives[j])) {
				dominatesList[i].push(j);
				dominated[j]++;
			} else if (dominates(objectives[j], objectives[i])) {
				dominatesList[j].push(i);
				dominated[i]++;
			}
		}
	}

	return { dominated, dominates: dominatesList };
}
