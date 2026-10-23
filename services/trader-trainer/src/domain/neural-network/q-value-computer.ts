import { agentError } from "@trading-model/common/utils/errors";
import type { NeuralNetwork } from "./neural-network";
import type { QLearningExperience } from "./type";

function _assertActionInRange(action: number, actionCount: number): void {
	if (!Number.isInteger(action) || action < 0 || action >= actionCount) {
		throw agentError(
			`Q-learning action ${action} is outside [0, ${actionCount - 1}].`
		);
	}
}

export function computeQLearningTarget(
	nn: NeuralNetwork,
	exp: QLearningExperience,
	gamma: number
): Float32Array {
	const target = exp.output.slice();
	_assertActionInRange(exp.action, target.length);
	const nextQ = nn.forward(exp.nextState).output;
	const maxNextQ = exp.done ? 0 : Math.max(...nextQ);

	target[exp.action] = exp.reward + gamma * maxNextQ;
	return target;
}
