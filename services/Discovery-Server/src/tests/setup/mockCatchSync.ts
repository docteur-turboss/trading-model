jest.mock("cash-lib/middleware/catchError", () => ({
  catchSync: (fn: any) => fn,
}));