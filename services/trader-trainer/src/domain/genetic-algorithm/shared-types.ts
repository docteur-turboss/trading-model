import type { Genome } from "./genome";

export type { Experience } from "../neural-network/type";
export type {
	Genome,
	LamarckGenome,
} from "./genome";

export type DeepReadonly<TValue> = TValue extends (infer UValue)[]
	? readonly DeepReadonly<UValue>[]
	: TValue extends
				| number
				| string
				| boolean
				| bigint
				| symbol
				| null
				| undefined
		? TValue
		: { readonly [KValue in keyof TValue]: DeepReadonly<TValue[KValue]> };

export function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
	if (obj === null || typeof obj !== "object") {
		return obj as DeepReadonly<TValue>;
	}
	if (ArrayBuffer.isView(obj)) {
		return obj as DeepReadonly<TValue>;
	}
	for (const key of Object.keys(obj)) {
		const val = (obj as Record<string, unknown>)[key];
		if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
			deepFreeze(val);
		}
	}
	return Object.freeze(obj) as DeepReadonly<TValue>;
}

export function withGenome<TGenome extends Genome>(
	base: DeepReadonly<TGenome>,
	patch: Partial<TGenome>
): DeepReadonly<TGenome> {
	return deepFreeze({ ...base, ...patch } as TGenome) as DeepReadonly<TGenome>;
}
