export { createNetworkGenome } from "./genome-network/create";
export { crossoverNetwork } from "./genome-network/crossover";
export type { MutateNetworkContext } from "./genome-network/mutation";
export { mutateLayer, mutateNetworkStructure } from "./genome-network/mutation";
export type {
	ClipBounds,
	LayerGenome,
	NetworkGenome,
} from "./genome-network/types";
export {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
	repairLayer,
	repairNetwork,
	validateLayer,
	validateNetwork,
} from "./genome-network/types";
