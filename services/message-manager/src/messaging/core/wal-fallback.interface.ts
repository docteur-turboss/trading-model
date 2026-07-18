import type { MemoryWalEntry } from "./memory-wal-entry";

export interface WalFallback {
	trySave(removed: MemoryWalEntry[]): Promise<unknown>;
	recover?(): Promise<MemoryWalEntry[]>;
}
