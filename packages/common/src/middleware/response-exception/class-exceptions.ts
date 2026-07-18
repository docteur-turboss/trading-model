import { HTTP_STATUS } from "../../http-status";
import type { ResponseObject } from "./http-codes";

export class ClassResponseExceptions {
	readonly reason: string;

	constructor(reason: unknown) {
		this.reason = typeof reason === "string" ? reason : JSON.stringify(reason);
	}

	serviceUnavailable(): ResponseObject {
		return { status: HTTP_STATUS.SERVICE_UNAVAILABLE, data: this.reason };
	}

	unknownError(): ResponseObject {
		return { status: HTTP_STATUS.INTERNAL_SERVER_ERROR, data: this.reason };
	}

	invalidToken(): ResponseObject {
		return { status: HTTP_STATUS.INVALID_TOKEN, data: this.reason };
	}

	tooManyRequests(): ResponseObject {
		return { status: HTTP_STATUS.TOO_MANY_REQUESTS, data: this.reason };
	}

	imaTeapot(): ResponseObject {
		return { status: HTTP_STATUS.IM_A_TEAPOT, data: this.reason };
	}

	payloadTooLarge(): ResponseObject {
		return { status: HTTP_STATUS.PAYLOAD_TOO_LARGE, data: this.reason };
	}

	gone(): ResponseObject {
		return { status: HTTP_STATUS.GONE, data: this.reason };
	}

	conflict(): ResponseObject {
		return { status: HTTP_STATUS.CONFLICT, data: this.reason };
	}

	methodNotAllowed(): ResponseObject {
		return { status: HTTP_STATUS.METHOD_NOT_ALLOWED, data: this.reason };
	}

	notFound(): ResponseObject {
		return { status: HTTP_STATUS.NOT_FOUND, data: this.reason };
	}

	forbidden(): ResponseObject {
		return { status: HTTP_STATUS.FORBIDDEN, data: this.reason };
	}

	paymentRequired(): ResponseObject {
		return { status: HTTP_STATUS.PAYMENT_REQUIRED, data: this.reason };
	}

	unauthorized(): ResponseObject {
		return { status: HTTP_STATUS.UNAUTHORIZED, data: this.reason };
	}

	badRequest(): ResponseObject {
		return { status: HTTP_STATUS.BAD_REQUEST, data: this.reason };
	}

	noContent(): ResponseObject {
		return { status: HTTP_STATUS.NO_CONTENT, data: undefined };
	}

	ok(): ResponseObject {
		return { status: HTTP_STATUS.CREATED, data: this.reason };
	}

	success(): ResponseObject {
		return { status: HTTP_STATUS.OK, data: this.reason };
	}
}

export const ResponseException = (
	reason: unknown = ""
): ClassResponseExceptions => new ClassResponseExceptions(reason);
