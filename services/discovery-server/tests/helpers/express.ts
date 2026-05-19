export const createReq = (overrides: Record<string, unknown> = {}): any => ({
  body: {},
  params: {},
  headers: {},
  ...overrides,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createRes = (): any => ({})

export const createNext = () => undefined
