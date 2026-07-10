import type { Topic } from "@trading-model/common/domain/primitives";

export class TopicSet {
	private _topics: Topic[] = [];

	get topics(): Topic[] {
		return this._topics;
	}

	setTopics(topics: Topic[]): void {
		this._topics = topics;
	}

	addTopics(topics: Topic[]): void {
		this._topics = [...new Set([...this._topics, ...topics])];
	}

	removeTopics(topics: Topic[]): void {
		this._topics = this._topics.filter((topic) => !topics.includes(topic));
	}
}
