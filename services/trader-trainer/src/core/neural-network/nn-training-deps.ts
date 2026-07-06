import type { LayerMemory, NeuralNetworkConfig } from "./type";
import type { OptimizerHyperparams } from "./optimizer";

export interface NnTrainingDeps {
	config: Required<NeuralNetworkConfig>;
	layers: LayerMemory[];
	optimizerHp: OptimizerHyperparams;
}
