import { AppError, agentError } from "@trading-model/common/utils/errors";

import type { LayerMemory } from "./type";
import { GAUSSIAN_NOISE as gaussianNoise } from "./utils";

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
		for (let i = 0; i < layer.weights.length; i++) {
			buffer[cursor++] = layer.weights[i];
		}
		for (let i = 0; i < layer.bias.length; i++) {
			buffer[cursor++] = layer.bias[i];
		}
	}
	return buffer;
}

/**
 * Load a flat parameter buffer back into the network layers.
 *
 * @throws {AgentError} When the buffer length does not match the total parameter count.
 */
function _validateBufferLength(layers: LayerMemory[], buffer: Float32Array): void {
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
		for (let i = 0; i < layer.weights.length; i++) {
			layer.weights[i] = buffer[cursor++];
		}
		for (let i = 0; i < layer.bias.length; i++) {
			layer.bias[i] = buffer[cursor++];
		}
	}
}

/**
 * Perturb weights around a reference using Gaussian noise.
 *
 * @param layers - Network layer memory array.
 * @param reference - Either a Float32Array of weights or a scalar number.
 * @param sigma - Standard deviation of the perturbation noise.
 */
function _resolveReference(
	reference: Float32Array | number,
	count: number
): Float32Array {
	if (typeof reference === "number") {
		return new Float32Array(count).fill(reference);
	}
	if (reference.length !== count) {
		throw agentError(
			`Reference parameter count (${reference.length}) does not match this network's parameter count (${count}).`
		);
	}
	return reference;
}

function _perturbWeights(mean: Float32Array, sigma: number): Float32Array {
	const childBuffer = new Float32Array(mean.length);
	for (let i = 0; i < mean.length; i++) {
		childBuffer[i] = mean[i] + gaussianNoise(sigma);
	}
	return childBuffer;
}

export function distributeAroundWeights(
	layers: LayerMemory[],
	reference: Float32Array | number,
	sigma: number
): void {
	const count = parameterCount(layers);
	const mean = _resolveReference(reference, count);
	setWeights(layers, _perturbWeights(mean, sigma));
}
