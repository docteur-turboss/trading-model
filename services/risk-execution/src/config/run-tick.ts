/**
 * Runs one risk tick, then republishes the gauges whether it failed or not:
 * the switch engaged in memory during a failed tick (e.g. state write error)
 * must still reach `risk_kill_switch`.
 */
export async function runTick(
	tick: () => Promise<unknown>,
	publish: () => void,
	onFailure: (error: unknown) => void
): Promise<void> {
	try {
		await tick();
	} catch (error) {
		onFailure(error);
	}
	publish();
}
