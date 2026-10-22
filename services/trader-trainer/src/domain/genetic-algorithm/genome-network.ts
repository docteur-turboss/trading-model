export { createNetworkGenome } from "./genome-network/create";
export { crossoverNetwork } from "./genome-network/crossover";
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
	repairNetwork,
	validateNetwork,
} from "./genome-network/types";
