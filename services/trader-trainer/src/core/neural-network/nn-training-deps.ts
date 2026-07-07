import type { OptimizerHyperparams } from "./optimizer";
import type { LayerMemory, NeuralNetworkConfig } from "./type";

export interface NnTrainingDeps {
	config: Required<NeuralNetworkConfig>;
	layers: LayerMemory[];
	optimizerHp: OptimizerHyperparams;
}
