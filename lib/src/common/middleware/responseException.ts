// Liste unique des codes avec leur nom et valeur HTTP
const httpResponseDefinitions = [
  { key: "UnknownError", code: 500 },
  { key: "InvalidToken", code: 498 },
  { key: "TooManyRequests", code: 429 },
  { key: "IMATeapot", code: 418 },
  { key: "PayloadTooLarge", code: 413 },
  { key: "NotFound", code: 404 },
  { key: "MethodNotAllowed", code: 405 },
  { key: "Forbidden", code: 403 },
  { key: "PaymentRequired", code: 402 },
  { key: "Unauthorized", code: 401 },
  { key: "BadRequest", code: 400 },
  { key: "OK", code: 201 },
  { key: "Success", code: 200 },
] as const;

export const HTTP_CODE = Object.fromEntries(
  httpResponseDefinitions.map(({ key }) => [key, key])
) as { [K in typeof httpResponseDefinitions[number]["key"]]: K };

export const ResponseCodes = Object.fromEntries(
  httpResponseDefinitions.map(({ key, code }) => [key, code])
) as { [K in typeof httpResponseDefinitions[number]["key"]]: number };

export type ResponseCodeKey = keyof typeof ResponseCodes;
export type ResponseCodeValue = typeof ResponseCodes[ResponseCodeKey];

export class ClassResponseExceptions extends Error {
  reason: string;

  constructor(reason: unknown) {
    super()
    this.reason = typeof reason === "string" ? reason : JSON.stringify(reason);
  }

  UnknownError() {
    return { status: ResponseCodes.UnknownError, data: this.reason };
  }

  InvalidToken() {
    return { status: ResponseCodes.InvalidToken, data: this.reason };
  }

  TooManyRequests() {
    return { status: ResponseCodes.TooManyRequests, data: this.reason };
  }

  IMATeapot() {
    return { status: ResponseCodes.IMATeapot, data: this.reason };
  }

  PayloadTooLarge() {
    return { status: ResponseCodes.PayloadTooLarge, data: this.reason };
  }

  NotFound() {
    return { status: ResponseCodes.NotFound, data: this.reason };
  }

  MethodNotAllowed() {
    return { status: ResponseCodes.MethodNotAllowed, data: this.reason };
  }

  Forbidden() {
    return { status: ResponseCodes.Forbidden, data: this.reason };
  }

  PaymentRequired() {
    return { status: ResponseCodes.PaymentRequired, data: this.reason };
  }

  Unauthorized() {
    return { status: ResponseCodes.Unauthorized, data: this.reason };
  }

  BadRequest() {
    return { status: ResponseCodes.BadRequest, data: this.reason };
  }

  OK() {
    return { status: ResponseCodes.OK, data: this.reason };
  }

  Success() {
    return { status: ResponseCodes.Success, data: this.reason };
  }
}

export const ResponseException = (reason: unknown = "") =>
  new ClassResponseExceptions(reason);
