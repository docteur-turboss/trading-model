import rateLimit from "express-rate-limit";

function createDlqRateLimiter(opts: {
	windowMs: number;
	max: number;
	message: { error: string };
}): ReturnType<typeof rateLimit> {
	return rateLimit({
		...opts,
		standardHeaders: true,
		legacyHeaders: false,
		// shortcut: in-memory counters, so the limit holds per pod, not globally; move to a shared store if a global limit is ever needed (ADR-0047).
	});
}

function _createReplayLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		windowMs: 60_000,
		max: 10,
		message: { error: "Too many replay requests, try again later" },
	});
}

function _createWriteLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		windowMs: 1000,
		max: 100,
		message: { error: "Too many DLQ write requests, try again later" },
	});
}

function _createHealthLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		windowMs: 60_000,
		max: 60,
		message: { error: "Too many health check requests" },
	});
}

export { _createHealthLimiter, _createReplayLimiter, _createWriteLimiter };
