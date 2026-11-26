/** True when `reason` may replace the `current` reason of a switch (none engaged, or an override). */
export function engages(
	current: string | null | undefined,
	reason: string
): boolean {
	// drawdown overrides other reasons (re-arm owner-only, policy §4.4); cumulative_loss overrides all and nothing overrides it
	return (
		!current ||
		((reason === "drawdown" || reason === "cumulative_loss") &&
			current !== reason &&
			current !== "cumulative_loss" &&
			current !== "state_unreadable")
	);
}
