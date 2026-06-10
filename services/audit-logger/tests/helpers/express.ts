export const createReq = (overrides: Record<string, unknown> = {}): any => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  ...overrides,
});

export const createRes = (): any => ({});

export const createNext = () => undefined;
