// src/core/errors.test.ts
import {
  AddressManagerBaseError,
  ServiceNotFoundError,
  ServiceUnreachableError,
  AuthenticationError,
  AddressManagerError,
} from "../../common/utils/Errors";

describe("AddressManager Errors", () => {
  // ---------------------------------------------------------------------------
  // AddressManagerBaseError
  // ---------------------------------------------------------------------------
test("✅ AddressManagerBaseError instantiation", () => {
  const cause = new Error("root cause");

  class ConcreteError extends AddressManagerBaseError {
    constructor(message: string, cause?: unknown) {
      super(message, cause);
    }
  }

  const err = new ConcreteError("Base error", cause);

  expect(err).toBeInstanceOf(Error);
  expect(err).toBeInstanceOf(AddressManagerBaseError);
  expect(err.message).toBe("Base error");
  expect(err.cause).toBe(cause);
  expect(err.name).toBe("ConcreteError");
});

  test("✅ Preserves prototype chain", () => {
    class ConcreteError extends AddressManagerBaseError {
        constructor(message: string, cause?: unknown) {
        super(message, cause);
        }
    }

    const err = new ConcreteError("test");
    expect(Object.getPrototypeOf(err)).toBe(err.constructor.prototype);
  });

  // ---------------------------------------------------------------------------
  // ServiceNotFoundError
  // ---------------------------------------------------------------------------
  test("✅ ServiceNotFoundError sets message and cause", () => {
    const cause = new Error("root");
    const err = new ServiceNotFoundError("Service missing", cause);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AddressManagerBaseError);
    expect(err).toBeInstanceOf(ServiceNotFoundError);
    expect(err.message).toBe("Service missing");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("ServiceNotFoundError");
  });

  // ---------------------------------------------------------------------------
  // ServiceUnreachableError
  // ---------------------------------------------------------------------------
  test("✅ ServiceUnreachableError sets message and cause", () => {
    const err = new ServiceUnreachableError("Service unreachable");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AddressManagerBaseError);
    expect(err).toBeInstanceOf(ServiceUnreachableError);
    expect(err.message).toBe("Service unreachable");
    expect(err.cause).toBeUndefined();
    expect(err.name).toBe("ServiceUnreachableError");
  });

  // ---------------------------------------------------------------------------
  // AuthenticationError
  // ---------------------------------------------------------------------------
  test("✅ AuthenticationError sets message and cause", () => {
    const cause = "token invalid";
    const err = new AuthenticationError("Auth failed", cause);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AddressManagerBaseError);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe("Auth failed");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("AuthenticationError");
  });

  // ---------------------------------------------------------------------------
  // AddressManagerError
  // ---------------------------------------------------------------------------
  test("✅ AddressManagerError sets message and cause", () => {
    const cause = { code: 500 };
    const err = new AddressManagerError("Generic error", cause);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AddressManagerBaseError);
    expect(err).toBeInstanceOf(AddressManagerError);
    expect(err.message).toBe("Generic error");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("AddressManagerError");
  });
});