import { agentError } from "../errors";
import type { LayerMemory } from "./type";

/**
 * Count total trainable parameters (weights + biases) across all layers.
 */
export function parameterCount(layers: LayerMemory[]): number {
	let total = 0;
	for (let i = 0; i < layers.length; i++) {
		total += layers[i].weights.length;
		total += layers[i].bias.length;
	}
	return total;
}

/**
 * Flatten every weight and bias into a single Float32Array.
 *
 * Layout per matrix block:
 * [ w[i][0][0], w[i][0][1], …, b[i][0], …, b[i][fanOut-1] ]
 */
export function getWeights(layers: LayerMemory[]): Float32Array {
	const total = parameterCount(layers);
	const buffer = new Float32Array(total);
	let cursor = 0;
	for (const layer of layers) {
		buffer.set(layer.weights, cursor);
		cursor += layer.weights.length;
		buffer.set(layer.bias, cursor);
		cursor += layer.bias.length;
	}
	return buffer;
}

/**
 * Load a flat parameter buffer back into the network layers.
 *
 * @throws {AgentError} When the buffer length does not match the total parameter count.
 */
function _validateBufferLength(
	layers: LayerMemory[],
	buffer: Float32Array
): void {
	const expected = parameterCount(layers);
	if (buffer.length !== expected) {
		throw agentError(
			`Buffer length mismatch: expected ${expected}, got ${buffer.length}`
		);
	}
}

export function setWeights(layers: LayerMemory[], buffer: Float32Array): void {
	_validateBufferLength(layers, buffer);
	let cursor = 0;
	for (const layer of layers) {
		layer.weights.set(buffer.subarray(cursor, cursor + layer.weights.length));
		cursor += layer.weights.length;
		layer.bias.set(buffer.subarray(cursor, cursor + layer.bias.length));
		cursor += layer.bias.length;
	}
}
