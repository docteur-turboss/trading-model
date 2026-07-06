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

export const HTTP_CODE = Object.fromEntries(
	HTTP_RESPONSE_DEFINITIONS.map(({ key }) => [key, key])
) as { [TKey in (typeof HTTP_RESPONSE_DEFINITIONS)[number]["key"]]: TKey };

export const ResponseCodes = Object.fromEntries(
	HTTP_RESPONSE_DEFINITIONS.map(({ key, code }) => [key, code])
) as { [TKey in (typeof HTTP_RESPONSE_DEFINITIONS)[number]["key"]]: number };

export type ResponseCodeKey = keyof typeof ResponseCodes;
export type ResponseCodeValue = (typeof HTTP_RESPONSE_DEFINITIONS)[number]["code"];

export interface ResponseObject {
	status: number;
	data: unknown;
}

function _buildResponse(reason: string, code: number): ResponseObject {
	return { status: code, data: reason };
}

export class ClassResponseExceptions extends Error {
	readonly reason: string;

	constructor(reason: unknown) {
		super();
		this.name = "ClassResponseExceptions";
		this.reason = typeof reason === "string" ? reason : JSON.stringify(reason);
	}

	serviceUnavailable() { return _buildResponse(this.reason, ResponseCodes.serviceUnavailable); }
	unknownError() { return _buildResponse(this.reason, ResponseCodes.unknownError); }
	invalidToken() { return _buildResponse(this.reason, ResponseCodes.invalidToken); }
	tooManyRequests() { return _buildResponse(this.reason, ResponseCodes.tooManyRequests); }
	imaTeapot() { return _buildResponse(this.reason, ResponseCodes.imaTeapot); }
	payloadTooLarge() { return _buildResponse(this.reason, ResponseCodes.payloadTooLarge); }
	gone() { return _buildResponse(this.reason, ResponseCodes.gone); }
	conflict() { return _buildResponse(this.reason, ResponseCodes.conflict); }
	methodNotAllowed() { return _buildResponse(this.reason, ResponseCodes.methodNotAllowed); }
	notFound() { return _buildResponse(this.reason, ResponseCodes.notFound); }
	forbidden() { return _buildResponse(this.reason, ResponseCodes.forbidden); }
	paymentRequired() { return _buildResponse(this.reason, ResponseCodes.paymentRequired); }
	unauthorized() { return _buildResponse(this.reason, ResponseCodes.unauthorized); }
	badRequest() { return _buildResponse(this.reason, ResponseCodes.badRequest); }
	noContent() { return { status: ResponseCodes.noContent, data: undefined }; }
	ok() { return _buildResponse(this.reason, ResponseCodes.ok); }
	success() { return _buildResponse(this.reason, ResponseCodes.success); }
}

export const ResponseException = (reason: unknown = "") =>
	new ClassResponseExceptions(reason);

export const sendResponse = (
	data: unknown,
	status: number
): ResponseObject => ({
	status,
	data,
});
