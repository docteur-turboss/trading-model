export class AckHandler {
	async handleAck(_messageId: string, _instanceId: string): Promise<void> {}

	async handleNack(_messageId: string, _instanceId: string): Promise<void> {}
}
