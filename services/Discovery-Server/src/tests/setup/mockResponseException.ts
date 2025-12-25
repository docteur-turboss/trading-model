jest.mock("cash-lib/middleware/responseException", () => ({
  ResponseException: jest.fn((body: any) => ({
    BadRequest: () => ({ type: "BadRequest", error: body }),
    Unauthorized: () => ({ type: "Unauthorized", error: body }),
    NotFound: () => ({ type: "NotFound", error: body }),
    OK: () => ({ type: "OK", ...body }),
    Success: () => ({ type: "Success", ...body }),
  })),
}));