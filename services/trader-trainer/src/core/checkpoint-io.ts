import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface CheckpointIO {
	readFile(path: string): string;
	writeFile(path: string, data: string): void;
	fileExists(path: string): boolean;
}

export class NodeCheckpointIO implements CheckpointIO {
	readFile(path: string): string {
		return readFileSync(path, "utf-8");
	}
	writeFile(path: string, data: string): void {
		writeFileSync(path, data, "utf-8");
	}
	fileExists(path: string): boolean {
		return existsSync(path);
	}
}
