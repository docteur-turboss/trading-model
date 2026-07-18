import { LogLevel } from "./log-types";
import { Logger } from "./logger";
import { getNodeEnv, NODE_ENV } from "./node-env";

export function createLogger(): Logger {
	const nodeEnv = getNodeEnv();
	const logLevel =
		nodeEnv === NODE_ENV.DEVELOPMENT
			? LogLevel.Debug
			: nodeEnv === NODE_ENV.STAGING
				? LogLevel.Info
				: LogLevel.Warn;
	return new Logger(logLevel);
}
