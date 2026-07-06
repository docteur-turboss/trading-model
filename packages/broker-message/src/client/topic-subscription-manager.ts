export class TopicSubscriptionManager {
	private _topics: string[] = [];

	get topics(): string[] {
		return this._topics;
	}

	setTopics(topics: string[]): void {
		this._topics = topics;
	}

	addTopics(topics: string[]): void {
		this._topics = [
			...new Set([...this._topics, ...topics]),
		];
	}

	removeTopics(topics: string[]): void {
		this._topics = this._topics.filter(
			(topic) => !topics.includes(topic)
		);
	}
}
