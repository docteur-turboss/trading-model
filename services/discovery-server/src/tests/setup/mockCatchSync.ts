 /* eslint-disable */
 jest.mock("@trading-model/common/middleware/catchError", () => ({
  catchSync: (fn: any) => fn,
}));