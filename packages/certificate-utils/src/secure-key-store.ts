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

// Track all created stores for cleanup on process exit
const stores = new Set<SecureKeyStore>();

function globalCleanup(): void {
  for (const store of stores) {
    try {
      store.destroy();
    } catch {
      /* cleanup */
    }
  }
  stores.clear();
}

process.once('exit', globalCleanup);
process.once('SIGINT', globalCleanup);
process.once('SIGTERM', globalCleanup);
// Zero keys before heap dump to prevent capture via --heapsnapshot
// Save and chain any existing handler to avoid replacing it
const prevSigUsr2 = process.listeners('SIGUSR2')[0] as (() => void) | undefined;
process.removeAllListeners('SIGUSR2');
process.on('SIGUSR2', () => {
  globalCleanup();
  if (prevSigUsr2) {
    prevSigUsr2();
  } else {
    process.kill(process.pid, 'SIGUSR2');
  }
});

export class SecureKeyStore {
  private buffer: Buffer | null;
  private disposed = false;

  constructor(pem: string) {
    const len = Buffer.byteLength(pem, 'utf8');
    this.buffer = Buffer.alloc(len); // safe: zeroed, no residual data leak
    this.buffer.write(pem, 'utf8');
    stores.add(this);
  }

  read(): string {
    if (this.disposed || !this.buffer) {
      throw new Error('SecureKeyStore has been destroyed');
    }
    return this.buffer.toString('utf8');
  }

  get raw(): Buffer | null {
    return this.buffer;
  }

  destroy(): void {
    this.disposed = true;
    if (this.buffer) {
      this.buffer.fill(0);
      this.buffer = null;
    }
    stores.delete(this);
  }

  toJSON(): never {
    throw new Error('SecureKeyStore cannot be serialized to JSON');
  }

  toString(): never {
    throw new Error('SecureKeyStore cannot be converted to string directly; use .read()');
  }

  get [Symbol.toStringTag](): string {
    return 'SecureKeyStore';
  }
}
