import type { z } from "zod";

/**
 * JSON shape of a `@trading-model/contracts` type: the `primitives` brands
 * removed, which is what travels between services.
 */
export type ContractShape<Value> = Value extends string
	? string
	: Value extends number
		? number
		: Value extends boolean
			? boolean
			: Value extends readonly (infer Item)[]
				? ContractShape<Item>[]
				: Value extends object
					? { [Key in keyof Value]: ContractShape<Value[Key]> }
					: Value;

/** Anything a producer typed with the contract sends, the schema accepts. */
export type AcceptsContract<Schema extends z.ZodType, Contract> = [
	ContractShape<Contract>,
] extends [z.input<Schema>]
	? true
	: false;

/** What the schema hands to the receiver is the contract type. */
export type YieldsContract<Schema extends z.ZodType, Contract> = [
	z.output<Schema>,
] extends [Contract]
	? [Contract] extends [z.output<Schema>]
		? true
		: false
	: false;

/**
 * Compile-time assertion (ADR-0021): `tsc` fails with "Type 'false' does not
 * satisfy the constraint 'true'" when a wire schema and its contract drift.
 * It must live in `src`: the Jest configs do not type-check specs.
 */
export type Assert<Condition extends true> = Condition;
