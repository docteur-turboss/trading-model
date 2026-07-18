import ChainedError from "chained-error";
import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";

enum DbErrorCode {
	NoResultReturned = "No result returned",
	DuplicateEntry = "Duplicate entry",
	NameUnique = "name_UNIQUE",
	EmailUnique = "email_UNIQUE",
}

enum DbErrorMessage {
	NotFound = "404",
	NameAlreadyExists = "Name already exists",
	EmailAlreadyExists = "Email already exists",
}

export const normalizeDbError = (file: string) => (err: unknown) => {
	if (err instanceof ChainedError) {
		const msg = err.message ?? "";
		if (msg.includes(DbErrorCode.NoResultReturned)) {
			throw new Error(DbErrorMessage.NotFound);
		}
		if (msg.includes(DbErrorCode.DuplicateEntry)) {
			if (msg.includes(DbErrorCode.NameUnique)) {
				throw new Error(DbErrorMessage.NameAlreadyExists);
			}
			if (msg.includes(DbErrorCode.EmailUnique)) {
				throw new Error(DbErrorMessage.EmailAlreadyExists);
			}
		}
	}

	logger.error("Model operation failed", {
		context: { file, err: normalizeError(err) },
	});
	throw err;
};
