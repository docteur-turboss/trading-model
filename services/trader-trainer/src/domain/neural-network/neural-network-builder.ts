import {
	mergeConfig,
	type NeuralNetworkConfig,
} from "@trading-model/model-runtime/neural-network/type";
import {
	createLayerMemories,
	validateActivationLoss,
	validateMinLayers,
} from "./neural-network-config-utils";
import type { NnTrainingDeps } from "./nn-training-deps";

export const NeuralNetworkBuilder = {
	build(cfg: NeuralNetworkConfig): NnTrainingDeps {
		const config = mergeConfig(cfg);
		validateMinLayers(config);
		const layers = createLayerMemories(config);
		validateActivationLoss(config, layers.length);
		return { config, layers };
	},
};
