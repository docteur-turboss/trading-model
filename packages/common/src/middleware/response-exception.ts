import { HTTP_STATUS } from "../http-status";

const HTTP_RESPONSE_DEFINITIONS = [
	{ key: "serviceUnavailable", code: HTTP_STATUS.SERVICE_UNAVAILABLE },
	{ key: "unknownError", code: HTTP_STATUS.INTERNAL_SERVER_ERROR },
	{ key: "invalidToken", code: 498 },
	{ key: "tooManyRequests", code: HTTP_STATUS.TOO_MANY_REQUESTS },
	{ key: "imaTeapot", code: 418 },
	{ key: "payloadTooLarge", code: 413 },
	{ key: "gone", code: 410 },
	{ key: "conflict", code: HTTP_STATUS.CONFLICT },
	{ key: "methodNotAllowed", code: HTTP_STATUS.METHOD_NOT_ALLOWED },
	{ key: "notFound", code: HTTP_STATUS.NOT_FOUND },
	{ key: "forbidden", code: HTTP_STATUS.FORBIDDEN },
	{ key: "paymentRequired", code: 402 },
	{ key: "unauthorized", code: HTTP_STATUS.UNAUTHORIZED },
	{ key: "badRequest", code: HTTP_STATUS.BAD_REQUEST },
	{ key: "noContent", code: HTTP_STATUS.NO_CONTENT },
	{ key: "ok", code: HTTP_STATUS.CREATED },
	{ key: "success", code: HTTP_STATUS.OK },
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

const ResponseMethodProxyHandler: ProxyHandler<ClassResponseExceptions> = {
	get(target, prop) {
		if (typeof prop === "symbol" || prop in target) {
			return Reflect.get(target, prop);
		}
		const def = HTTP_RESPONSE_DEFINITIONS.find((d) => d.key === prop);
		if (!def) { return; }
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
		ResponseMethodProxyHandler
	) as ClassResponseExceptions & ResponseMethods;

export const sendResponse = (
	data: unknown,
	status: number
): ResponseObject => ({
	status,
	data,
});
