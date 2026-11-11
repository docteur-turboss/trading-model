import { z } from "zod";

/**
 * Body of every error response (ADR-0021): `details` lists the fields that
 * failed validation.
 */
export const ErrorResponse = z.object({
	error: z.string(),
	/** Why the caller was refused (mTLS identity, ACL). */
	reason: z.string().optional(),
	details: z
		.array(z.object({ field: z.string(), message: z.string() }))
		.optional(),
});
/** Body shape of an error response sent by an API route. */
export type ErrorResponse = z.output<typeof ErrorResponse>;

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

/** A response body that is not JSON (`responses: { 200: binary("application/octet-stream") }`). */
export interface BinaryBody {
	readonly binary: string;
}

/** Response schema marker: the route answers with a binary body of this media type. */
export function binary(mediaType: string): BinaryBody {
	return { binary: mediaType };
}

function isBinaryBody(value: unknown): value is BinaryBody {
	return typeof value === "object" && value !== null && "binary" in value;
}

/** HTTP methods an API route can be mounted on. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * One HTTP route of a service, as declared in its `api-routes.ts` registry
 * (ADR-0021). The same entry mounts the Express route, validates its input
 * and generates its OpenAPI operation.
 *
 * Schemas describe the JSON on the wire: request schemas may transform
 * (exported with their input side), response schemas must not.
 */
export interface ApiRoute {
	method: HttpMethod;
	/** Express path, `:param` segments included. */
	path: string;
	summary: string;
	/**
	 * Credentials the route checks on top of the caller's mTLS identity, with
	 * a middleware mounted with it; documented in the OpenAPI.
	 * - `SignedRequest`: HMAC headers `x-service-name`, `x-timestamp`,
	 *   `x-signature` (`@trading-model/crypto` request signer).
	 * - `InstanceToken`: `x-instance-token`, the token discovery-server hands
	 *   out at registration.
	 */
	security?: readonly ("SignedRequest" | "InstanceToken")[];
	params?: z.ZodType;
	query?: z.ZodType;
	body?: z.ZodType;
	/** Response body schema by status; `null` for a response without body. */
	responses: Readonly<Record<number, z.ZodType | BinaryBody | null>>;
}

/** Keeps the literal types of a registry entry. */
export function defineRoute<const Route extends ApiRoute>(route: Route): Route {
	return route;
}

type Parsed<Schema> = Schema extends z.ZodType ? z.output<Schema> : undefined;

/** What a route handler receives once its input is validated. */
export interface ApiRouteInput<Route extends ApiRoute> {
	params: Parsed<Route["params"]>;
	query: Parsed<Route["query"]>;
	body: Parsed<Route["body"]>;
}

/** Request parts as received from Express, before validation. */
export interface RawRequest {
	params?: unknown;
	query?: unknown;
	body?: unknown;
}

const PARTS = ["params", "query", "body"] as const;

/**
 * Validates params, query and body against the route's schemas. Issue paths
 * are prefixed with the part they come from (`query.limit`).
 */
export function parseRequest<Route extends ApiRoute>(
	route: Route,
	request: RawRequest
):
	| { success: true; input: ApiRouteInput<Route> }
	| { success: false; error: ErrorResponse } {
	const input: Record<string, unknown> = {};
	const details: Array<{ field: string; message: string }> = [];
	for (const part of PARTS) {
		const schema = route[part];
		if (!schema) {
			input[part] = undefined;
			continue;
		}
		const result = schema.safeParse(request[part] ?? {});
		if (result.success) {
			input[part] = result.data;
			continue;
		}
		for (const issue of result.error.issues) {
			details.push({
				field: [part, ...issue.path.map(String)].join("."),
				message: issue.message,
			});
		}
	}
	if (details.length > 0) {
		return { success: false, error: { error: "Validation failed", details } };
	}
	// as unknown as: Zod-parsed input narrowed to the route generic
	return { success: true, input: input as unknown as ApiRouteInput<Route> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fields of the response that parsing dropped: object schemas strip unknown
 * keys, so a field the handler sends but the schema does not declare would
 * otherwise go unnoticed.
 */
function undocumentedFields(
	wire: unknown,
	parsed: unknown,
	path: string[] = []
): string[] {
	if (Array.isArray(wire) && Array.isArray(parsed)) {
		return wire.flatMap((item, index) =>
			undocumentedFields(item, parsed[index], [...path, String(index)])
		);
	}
	if (!(isRecord(wire) && isRecord(parsed))) {
		return [];
	}
	return Object.keys(wire).flatMap((key) =>
		key in parsed
			? undocumentedFields(wire[key], parsed[key], [...path, key])
			: [[...path, key].join(".")]
	);
}

/**
 * Checks a response against the route's schema for its status, after the JSON
 * round trip it takes on the wire. Returns the problems found, none when it
 * matches. Meant for tests and the E2E suite: production does not validate
 * its responses (ADR-0021).
 */
export function responseIssues(
	route: ApiRoute,
	status: number,
	data: unknown
): string[] {
	const label = `${route.method} ${route.path} → ${status}`;
	if (!(status in route.responses)) {
		return [`${label}: status not declared in the route's responses`];
	}
	const schema = route.responses[status];
	if (isBinaryBody(schema)) {
		return data instanceof Uint8Array || data instanceof ArrayBuffer
			? []
			: [`${label}: expected ${schema.binary} bytes`];
	}
	if (schema === null) {
		return data === undefined || data === null || data === ""
			? []
			: [`${label}: declared without body, got one`];
	}
	const wire =
		typeof data === "string"
			? JSON.parse(data)
			: JSON.parse(JSON.stringify(data ?? null));
	const result = schema.safeParse(wire);
	return result.success
		? undocumentedFields(wire, result.data).map(
				(field) => `${label}: ${field}: not in the response schema`
			)
		: result.error.issues.map(
				(issue) =>
					`${label}: ${issue.path.join(".") || "(body)"}: ${issue.message}`
			);
}
