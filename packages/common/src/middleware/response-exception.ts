const HTTP_RESPONSE_DEFINITIONS = [
	{ key: "serviceUnavailable", code: 503 },
	{ key: "unknownError", code: 500 },
	{ key: "invalidToken", code: 498 },
	{ key: "tooManyRequests", code: 429 },
	{ key: "imaTeapot", code: 418 },
	{ key: "payloadTooLarge", code: 413 },
	{ key: "gone", code: 410 },
	{ key: "conflict", code: 409 },
	{ key: "methodNotAllowed", code: 405 },
	{ key: "notFound", code: 404 },
	{ key: "forbidden", code: 403 },
	{ key: "paymentRequired", code: 402 },
	{ key: "unauthorized", code: 401 },
	{ key: "badRequest", code: 400 },
	{ key: "noContent", code: 204 },
	{ key: "ok", code: 201 },
	{ key: "success", code: 200 },
] as const;
type ResponseMethodKey = (typeof HTTP_RESPONSE_DEFINITIONS)[number]["key"];

export const HTTP_CODE = Object.fromEntries(
	HTTP_RESPONSE_DEFINITIONS.map(({ key }) => [key, key])
) as { [TKey in ResponseMethodKey]: TKey };

export const ResponseCodes = Object.fromEntries(
	HTTP_RESPONSE_DEFINITIONS.map(({ key, code }) => [key, code])
) as { [TKey in ResponseMethodKey]: number };

export type ResponseCodeKey = keyof typeof ResponseCodes;
export type ResponseCodeValue =
	(typeof HTTP_RESPONSE_DEFINITIONS)[number]["code"];

export interface ResponseObject {
	status: number;
	data: unknown;
}

type ResponseMethods = {
	[K in ResponseMethodKey]: () => ResponseObject;
};

export class ClassResponseExceptions extends Error {
	readonly reason: string;

	constructor(reason: unknown) {
		super();
		this.name = "ClassResponseExceptions";
		this.reason = typeof reason === "string" ? reason : JSON.stringify(reason);
	}
}

const _responseMethodProxyHandler: ProxyHandler<ClassResponseExceptions> = {
	get(target, prop) {
		if (typeof prop === "symbol" || prop in target) {
			return Reflect.get(target, prop);
		}
		const def = HTTP_RESPONSE_DEFINITIONS.find((d) => d.key === prop);
		if (!def) return undefined;
		if (def.key === "noContent") {
			return () => ({ status: def.code, data: undefined });
		}
		return () => ({ status: def.code, data: target.reason });
	},
};

export const ResponseException = (
	reason: unknown = ""
): ClassResponseExceptions & ResponseMethods =>
	new Proxy(
		new ClassResponseExceptions(reason),
		_responseMethodProxyHandler
	) as ClassResponseExceptions & ResponseMethods;

export const sendResponse = (
	data: unknown,
	status: number
): ResponseObject => ({
	status,
	data,
});
