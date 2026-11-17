import type {
	LayerMemory,
	NeuralNetworkConfig,
} from "@trading-model/model-runtime/neural-network/type";

export interface NnTrainingDeps {
	config: Required<NeuralNetworkConfig>;
	layers: LayerMemory[];
}
