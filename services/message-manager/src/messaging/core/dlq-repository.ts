import { appendFile } from 'node:fs/promises';

/** Single entry written to the Dead Letter Queue. */
export interface DqlEntry {
  /** The failed message payload and metadata. */
  message: unknown;

  /** Human-readable reason for the failure. */
  reason?: string;

  /** Number of delivery attempts made before the message was dead-lettered. */
  deliveryAttempt: number;

  /** ISO-8601 timestamp when the entry was created. */
  timestamp: string;
}

/**
 * File-based Dead Letter Queue repository.
 *
 * Appends dead-lettered messages as JSON Lines (NDJSON) to a file.
 * Each line is a JSON-serialized DqlEntry.
 */
export class DqlRepository {
  constructor(private readonly filePath: string = './dead-letter-queue.jsonl') {}

  /**
   * Persists a message to the Dead Letter Queue.
   *
   * @param entry - The entry to persist.
   */
  async add(entry: DqlEntry): Promise<void> {
    await appendFile(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }
}
