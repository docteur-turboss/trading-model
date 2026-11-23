import { randomUUID } from "node:crypto";
import { normalizeError } from "@trading-model/common/utils/errors";
import { runCli } from "@trading-model/common/utils/run-cli";
import {
	DlqEvent,
	type DlqEventMap,
} from "@trading-model/contracts/dlq-events";
import { openDlqCli } from "../config/dlq-cli";
import type { MongoDlqImportReport } from "../domain/mongo-dlq-import-report";

const USAGE = `Dead letters of the bus (ADR-0073), run inside an audit-logger pod:
  node services/audit-logger/dist/application/dlq-cli.js <operator> list <topic>
  node services/audit-logger/dist/application/dlq-cli.js <operator> replay <topic> <id>...
      Gives each entry back to the one group that failed, then removes it.
  node services/audit-logger/dist/application/dlq-cli.js <operator> delete <topic> <id>...
  node services/audit-logger/dist/application/dlq-cli.js <operator> import-mongo
      Once, before removing mongo-dlq: copies its waiting entries into the dead streams
      (MONGO_DLQ_URI, MONGO_DLQ_USERNAME, MONGO_DLQ_PASSWORD, MONGO_DLQ_DB). Replayable.
<operator> is recorded as the actor of the dlq.* audit event.`;

export interface DlqCliDeps {
	streams: {
		list(topic: string): Promise<unknown[]>;
		replay(topic: string, id: string): Promise<boolean>;
		delete(topic: string, id: string): Promise<boolean>;
	};
	/** Publishes the audit event; rejects when the bus refuses it. */
	publish<TEvent extends DlqEvent>(
		event: TEvent,
		payload: DlqEventMap[TEvent]
	): Promise<void>;
	/** Copies the MongoDB DLQ into the dead streams (import-mongo). */
	importMongo(): Promise<MongoDlqImportReport>;
	out(text: string): void;
	err(text: string): void;
}

/** Runs a dlq-cli command; resolves to the process exit code. */
export async function runDlqCli(
	args: string[],
	deps: DlqCliDeps
): Promise<number> {
	const [actor, command, topic, ...ids] = args;
	if (actor && command === "import-mongo" && !topic) {
		const report = await deps.importMongo();
		deps.out(JSON.stringify(report, null, 2));
		return report.written + report.alreadyImported === report.eligible ? 0 : 1;
	}
	const valid =
		actor &&
		topic &&
		((command === "list" && ids.length === 0) ||
			((command === "replay" || command === "delete") && ids.length > 0));
	if (!valid) {
		deps.err(USAGE);
		return 2;
	}
	if (command === "list") {
		deps.out(JSON.stringify(await deps.streams.list(topic), null, 2));
		return 0;
	}
	const done: string[] = [];
	const errors: unknown[] = [];
	try {
		for (const id of ids) {
			if (await deps.streams[command](topic, id)) {
				done.push(id);
			}
		}
	} catch (error) {
		errors.push(error);
	}
	try {
		if (command === "replay") {
			await deps.publish(DlqEvent.ReplayCompleted, {
				batchId: randomUUID(),
				topic,
				replayed: done.length,
				failed: ids.length - done.length,
				actor,
			});
		} else {
			await deps.publish(DlqEvent.EntriesDeleted, {
				ids: done,
				deleted: done.length,
				actor,
			});
		}
	} catch (publishError) {
		deps.err(
			`audit event not published: ${normalizeError(publishError).message}`
		);
		errors.push(publishError);
	}
	if (errors.length > 0) {
		throw errors[0];
	}
	const failed = ids.length - done.length;
	deps.out(`${command}: ${done.length} done, ${failed} not found`);
	return failed > 0 ? 1 : 0;
}

if (require.main === module) {
	const cli = openDlqCli();
	runCli(() =>
		runDlqCli(process.argv.slice(2), {
			...cli,
			out: (text) => console.log(text),
			err: (text) => console.error(text),
		})
	);
}
