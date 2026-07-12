import type { Genome } from "./genome-types";

export type { Experience } from "../neural-network/type";
export type {
	GAControlGenome,
	Genome,
	LamarckGenome,
	MarketStep,
} from "./genome-types";

export type DeepReadonly<TValue> = TValue extends (infer UValue)[]
	? readonly DeepReadonly<UValue>[]
	: TValue extends number
		? TValue
		: TValue extends string
			? TValue
			: TValue extends boolean
				? TValue
				: TValue extends bigint
					? TValue
					: TValue extends symbol
						? TValue
						: TValue extends null | undefined
							? TValue
							: {
									readonly [KValue in keyof TValue]: DeepReadonly<
										TValue[KValue]
									>;
								};

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
