import type { ForwardContext, PooledExperience } from "./type";

export class LearningPool {
	private _pool: PooledExperience[] = [];

	push(experience: PooledExperience, maxSize: number): void {
		this._pool.push(experience);
		if (this._pool.length > maxSize) {
			this._pool.shift();
		}
	}

	getSize(): number {
		return this._pool.length;
	}

	clear(): void {
		this._pool.length = 0;
	}

	getAll(): PooledExperience[] {
		return this._pool;
	}

	createExperience(params: {
		input: Float32Array;
		context: ForwardContext;
		target: Float32Array;
		loss: number;
	}): PooledExperience {
		const { input, context, target, loss } = params;
		return {
			kind: "supervised",
			input: new Float32Array(input),
			output: new Float32Array(context.output),
			target: new Float32Array(target),
			layerActivations: context.layerOutputs.map((out, idx) => ({
				output: new Float32Array(out),
				preActivation: new Float32Array(context.layerZValues[idx]),
				zValues: new Float32Array(context.layerZValues[idx]),
			})),
			loss,
		};
	}

	experienceToContext(exp: PooledExperience): ForwardContext {
		return {
			input: exp.input,
			output: exp.output,
			layerZValues: exp.layerActivations.map(
				(activation) => activation.zValues
			),
			layerOutputs: exp.layerActivations.map((activation) => activation.output),
		};
	}
}
