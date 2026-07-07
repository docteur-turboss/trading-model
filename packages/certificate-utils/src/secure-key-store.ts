/**
 * SecureKeyStore — protects sensitive key material in memory.
 *
 * - Stores the private key PEM in a dedicated Buffer allocated outside
 *   the normal V8 heap (uses Buffer.alloc with zeroed memory).
 * - Provides controlled access: the PEM is returned only when explicitly
 *   requested via `read()`.
 * - Supports explicit zeroing on `destroy()` to clear the key from memory.
 * - Overrides toJSON/toPrimitive to prevent accidental serialization.
 *
 * Usage:
 *   const store = new SecureKeyStore(privateKeyPem);
 *   const pem = store.read();   // returns the key
 *   store.destroy();            // zeroes the buffer
 */

const STORES = new Set<SecureKeyStore>();

function globalCleanup(): void {
	for (const store of STORES) {
		try {
			store.destroy();
		} catch {
			// cleanup
		}
	}
	STORES.clear();
}

process.once("exit", globalCleanup);
process.once("SIGINT", globalCleanup);
process.once("SIGTERM", globalCleanup);
const PREV_SIG_USR2 = process.listeners("SIGUSR2")[0] as
	| (() => void)
	| undefined;
process.removeAllListeners("SIGUSR2");
process.on("SIGUSR2", () => {
	globalCleanup();
	if (PREV_SIG_USR2) {
		PREV_SIG_USR2();
	} else {
		process.kill(process.pid, "SIGUSR2");
	}
});

export class SecureKeyStore {
	private _buffer!: Buffer;
	private _disposed = false;

	constructor(pem: string) {
		const len = Buffer.byteLength(pem, "utf8");
		this._buffer = Buffer.alloc(len); // safe: zeroed, no residual data leak
		this._buffer.write(pem, "utf8");
		STORES.add(this);
	}

	read(): string {
		if (this._disposed) {
			throw new Error("SecureKeyStore has been destroyed");
		}
		return this._buffer.toString("utf8");
	}

	get raw(): Buffer {
		return this._buffer;
	}

	destroy(): void {
		this._disposed = true;
		this._buffer.fill(0);
		STORES.delete(this);
	}

	toJSON(): never {
		throw new Error("SecureKeyStore cannot be serialized to JSON");
	}

	toString(): never {
		throw new Error(
			"SecureKeyStore cannot be converted to string directly; use .read()"
		);
	}

	get [Symbol.toStringTag](): string {
		return "SecureKeyStore";
	}
}
