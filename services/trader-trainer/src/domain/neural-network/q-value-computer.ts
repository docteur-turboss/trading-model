import { agentError } from "../../shared/errors";
import type { NeuralNetwork } from "./neural-network";
import type { QLearningExperience } from "./type";

function _assertActionInRange(action: number, actionCount: number): void {
	if (!Number.isInteger(action) || action < 0 || action >= actionCount) {
		throw agentError(
			`Q-learning action ${action} is outside [0, ${actionCount - 1}].`
		);
	}
}

/**
 * Replay target of a stored transition: the network's current Q-values, the
 * played action moved towards `reward + discount · max Q(next)` by `weight`
 * of the TD error (the importance-sampling weight of prioritized replay; 1
 * otherwise). The values stored with the transition are stale by then.
 */
export function computeReplayTarget(
	nn: NeuralNetwork,
	exp: QLearningExperience,
	discount: number,
	weight = 1
): { target: Float32Array; tdError: number } {
	const target = nn.forward(exp.input).output.slice();
	_assertActionInRange(exp.action, target.length);
	const maxNextQ = exp.done ? 0 : Math.max(...nn.forward(exp.nextState).output);
	const tdError = exp.reward + discount * maxNextQ - target[exp.action];
	target[exp.action] += weight * tdError;
	return { target, tdError };
}
