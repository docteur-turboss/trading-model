import type { NeuralNetwork } from "../../domain/neural-network/neural-network";
import type { QLearningExperience } from "./type";

export function computeQLearningTarget(
	nn: NeuralNetwork,
	exp: QLearningExperience,
	gamma: number
): Float32Array {
	const target = exp.output.slice();
	const nextQ = nn.forward(exp.nextState).output;
	const maxNextQ = exp.done ? 0 : Math.max(...nextQ);
	const actionIdx = target.indexOf(Math.max(...target));

	target[actionIdx] = exp.reward + gamma * maxNextQ;
	return target;
}
