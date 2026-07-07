import ChainedError from "chained-error";
import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";

export const normalizeDbError = (file: string) => (err: unknown) => {
	if (err instanceof ChainedError) {
		const msg = err.message ?? "";
		if (msg.includes("No result returned")) {
			throw new Error("404");
		}
		if (msg.includes("Duplicate entry")) {
			if (msg.includes("name_UNIQUE")) {
				throw new Error("Name already exists");
			}
			if (msg.includes("email_UNIQUE")) {
				throw new Error("Email already exists");
			}
		}
	}

	logger.error("Model operation failed", {
		context: { file, err: normalizeError(err) },
	});
	throw err;
};
