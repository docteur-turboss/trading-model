import {
	chainAuditSettingsFromEnv,
	createChainAudit,
	createRepositories,
} from "../config/container";
import { ENV } from "../infrastructure/config/env";
import type { ChainAudit } from "./audit-chain/chain-audit";

const USAGE = `Audit chain tools (ADR-0027), run inside an audit-logger pod:
  node services/audit-logger/dist/application/chain-cli.js report
      Full verification, anchors and acknowledged losses, as JSON: the report
      handed to auditors. Exit code 1 when the chain is broken.
  node services/audit-logger/dist/application/chain-cli.js acknowledge-loss <fromSequence> <reason>
      Records that the events from <fromSequence> on were lost (restore from
      an older backup). Immutable: it stays in every report.`;

export interface ChainCliDeps {
	open(): Promise<{
		audit: Pick<ChainAudit, "report" | "acknowledgeLoss">;
		close(): Promise<void>;
	}>;
	out(text: string): void;
	err(text: string): void;
}

/** Runs a chain-cli command; resolves to the process exit code. */
export async function runChainCli(
	args: string[],
	deps: ChainCliDeps
): Promise<number> {
	const [command, from, ...reason] = args;
	const fromSequence = Number(from);
	const valid =
		command === "report" ||
		(command === "acknowledge-loss" &&
			Number.isInteger(fromSequence) &&
			fromSequence > 0 &&
			reason.length > 0);
	if (!valid) {
		deps.err(USAGE);
		return 2;
	}
	const { audit, close } = await deps.open();
	try {
		if (command === "report") {
			const report = await audit.report();
			deps.out(JSON.stringify(report, null, 2));
			return report.verification.broken ? 1 : 0;
		}
		await audit.acknowledgeLoss(fromSequence, reason.join(" "));
		deps.out(`Loss acknowledged from sequence ${fromSequence}`);
		return 0;
	} finally {
		await close();
	}
}

if (require.main === module) {
	runChainCli(process.argv.slice(2), {
		open: async () => {
			const { mongoManager, db } = await createRepositories(ENV.MONGODB_URI);
			return {
				audit: createChainAudit(db, chainAuditSettingsFromEnv()),
				close: () => mongoManager.close(),
			};
		},
		out: (text) => console.log(text),
		err: (text) => console.error(text),
	}).then(
		(code) => process.exit(code),
		(err: unknown) => {
			console.error((err as Error)?.message ?? err);
			process.exit(1);
		}
	);
}
