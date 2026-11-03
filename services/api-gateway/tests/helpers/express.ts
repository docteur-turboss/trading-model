export const createReq = (overrides: Record<string, unknown> = {}): any => ({
	body: {},
	params: {},
	headers: {},
	ip: "127.0.0.1",
	socket: { remoteAddress: "127.0.0.1" },
	...overrides,
});

export const createRes = (): any => ({});

export const createNext = () => undefined;
