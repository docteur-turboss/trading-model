export const createReq = (overrides: Partial<any> = {}) => ({
  body: {},
  params: {},
  headers: {},
  ...overrides,
});

export const createRes: any = () => ({});
export const createNext = () => jest.fn();