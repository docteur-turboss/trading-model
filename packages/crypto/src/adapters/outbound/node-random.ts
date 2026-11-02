import type { RandomPort } from "../../domain/ports/random-port";
import { generateRandomStr } from "../../infrastructure/random-primitives";

export const nodeRandomAdapter: RandomPort = {
	generateRandomStr,
};

export { generateRandomStr };
