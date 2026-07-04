/**
 * Shared type definitions for GA module.
 * Centralized to avoid circular dependencies between modules.
 */

export type { Experience } from "../neural-network/type";
export type {
	GAControlGenome,
	Genome,
	LamarckGenome,
	MarketStep,
} from "./genome-types";

export type DeepReadonly<TValue> = TValue extends (infer UValue)[]
	? readonly DeepReadonly<UValue>[]
	: TValue extends object
		? { readonly [KValue in keyof TValue]: DeepReadonly<TValue[KValue]> }
		: TValue;
