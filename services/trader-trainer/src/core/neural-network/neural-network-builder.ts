import type { NnTrainingDeps } from "./nn-training-deps";
import type { NeuralNetworkConfig } from "./type";
import {
	mergeConfig,
	resolveOptimizerHyperparams,
	validateMinLayers,
	createLayerMemories,
	validateActivationLoss,
} from "./neural-network-config-utils";

export class NeuralNetworkBuilder {
	public static build(cfg: NeuralNetworkConfig): NnTrainingDeps {
		const config = mergeConfig(cfg);
		const optimizerHp = resolveOptimizerHyperparams(config);
		validateMinLayers(config);
		const layers = createLayerMemories(config, optimizerHp);
		validateActivationLoss(config, layers.length);
		return { config, layers, optimizerHp };
	}
}
