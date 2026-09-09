import type { ResponseObject } from "./http-codes";

/** Operations for building standardized HTTP response objects. */
export interface IResponseBuilder {
	readonly reason: string;
	serviceUnavailable(): ResponseObject;
	unknownError(): ResponseObject;
	invalidToken(): ResponseObject;
	tooManyRequests(): ResponseObject;
	imaTeapot(): ResponseObject;
	payloadTooLarge(): ResponseObject;
	gone(): ResponseObject;
	conflict(): ResponseObject;
	methodNotAllowed(): ResponseObject;
	notFound(): ResponseObject;
	forbidden(): ResponseObject;
	paymentRequired(): ResponseObject;
	unauthorized(): ResponseObject;
	badRequest(): ResponseObject;
	noContent(): ResponseObject;
	ok(): ResponseObject;
	success(): ResponseObject;
}
