export const createReq = (overrides: Record<string, unknown> = {}): any => ({
  body: {},
  params: {},
  headers: {},
  ...overrides,
});

 
export const createRes = (): any => ({});

export const createNext = () => undefined;
