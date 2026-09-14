import type { HashPort } from "../../domain/ports/hash-port";
import {
	sha256Base64url,
	sha256Hex,
} from "../../infrastructure/hash-primitives";

export const nodeHashAdapter: HashPort = {
	sha256Hex,
	sha256Base64url,
};

export { sha256Base64url, sha256Hex };
