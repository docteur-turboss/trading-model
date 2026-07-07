let shuttingDown = false;

export function setShuttingDown(value: boolean): void {
	shuttingDown = value;
}

export function isShuttingDown(): boolean {
	return shuttingDown;
}
