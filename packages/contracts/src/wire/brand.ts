import { z } from "zod";

/**
 * Applies a `primitives` brand in a schema, `.transform(brand(Topic.of))`: a
 * value the brand rejects becomes a validation issue (400). A bare
 * `.transform(Topic.of)` would throw out of the parse instead (500).
 */
export function brand<In, Out>(of: (value: In) => Out) {
	return (value: In, ctx: z.RefinementCtx): Out => {
		try {
			return of(value);
		} catch (err) {
			ctx.addIssue({
				code: "custom",
				message: err instanceof Error ? err.message : String(err),
			});
			return z.NEVER;
		}
	};
}
