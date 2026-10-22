import {
	createLayerMemories,
	mergeConfig,
	resolveOptimizerHyperparams,
	validateActivationLoss,
	validateMinLayers,
} from "./neural-network-config-utils";
import type { NnTrainingDeps } from "./nn-training-deps";
import type { NeuralNetworkConfig } from "./type";

export const NeuralNetworkBuilder = {
	build(cfg: NeuralNetworkConfig): NnTrainingDeps {
		const config = mergeConfig(cfg);
		const optimizerHp = resolveOptimizerHyperparams(config);
		validateMinLayers(config);
		const layers = createLayerMemories(config, optimizerHp);
		validateActivationLoss(config, layers.length);
		return { config, layers, optimizerHp };
	},
};
