import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { ForEachMachineFn } from "./circuit-breaker-sweeper";

export function buildStateSummary(
	forEachMachine: ForEachMachineFn
): Record<CircuitState, number> {
	const now = Date.now();
	const summary: Record<string, number> = {
		closed: 0,
		open: 0,
		"half-open": 0,
	};
	forEachMachine((_key, machine) => {
		summary[machine.getState(now)]++;
	});
	return summary as Record<CircuitState, number>;
}
