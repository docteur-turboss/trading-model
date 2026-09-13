import { getNodeEnv, NODE_ENV } from "../shared/node-env";
import { LogLevel } from "./log-types";
import { Logger } from "./logger";

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
