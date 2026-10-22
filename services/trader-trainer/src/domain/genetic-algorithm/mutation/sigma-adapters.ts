import type { MutationGenome } from "../genome-mutation";
import { MutationAdaptation } from "../genome-mutation";
import { sampleGaussian } from "../noise";

interface SigmaAdapter {
	readonly type: MutationAdaptation;
	adapt(mutation: MutationGenome, rng: () => number): number;
}

class FixedSigmaAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = MutationAdaptation.Fixed;
	adapt(mutation: MutationGenome): number {
		return mutation.rates.sigma;
	}
}

class SigmaAdaptiveAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = MutationAdaptation.SigmaAdaptive;
	adapt(mutation: MutationGenome, rng: () => number): number {
		return mutation.rates.sigma * (0.9 + 0.2 * rng());
	}
}

class SelfAdaptiveAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = MutationAdaptation.SelfAdaptive;
	adapt(mutation: MutationGenome, rng: () => number): number {
		const tau = 1 / Math.sqrt(2 * Math.max(1, mutation.rates.sigma));
		return mutation.rates.selfSigma * Math.exp(tau * sampleGaussian(rng, 1));
	}
}

class CmaSigmaAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = MutationAdaptation.Cma;
	adapt(mutation: MutationGenome): number {
		const damping = 1.0;
		const chiN = 1.0;
		const learningRate = 0.3;
		const pathRatio = mutation.rates.selfSigma / chiN;
		const exponent = (learningRate / damping) * (pathRatio - 1);
		const adapt = Math.exp(Math.max(-3, Math.min(3, exponent)));
		return mutation.rates.sigma * adapt;
	}
}

const SIGMA_ADAPTERS: Record<MutationAdaptation, SigmaAdapter> = {
	[MutationAdaptation.Fixed]: new FixedSigmaAdapter(),
	[MutationAdaptation.SigmaAdaptive]: new SigmaAdaptiveAdapter(),
	[MutationAdaptation.SelfAdaptive]: new SelfAdaptiveAdapter(),
	[MutationAdaptation.Cma]: new CmaSigmaAdapter(),
};

export function adaptSigma(
	mutation: MutationGenome,
	rng: () => number
): number {
	const adapter = SIGMA_ADAPTERS[mutation.adaptation];
	return adapter ? adapter.adapt(mutation, rng) : mutation.rates.sigma;
}
