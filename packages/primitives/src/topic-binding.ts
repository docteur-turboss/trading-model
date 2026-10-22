import type { Topic } from "./primitives";
import type { ServiceIdentity } from "./service-identity";

export interface TopicBinding {
	topic: Topic;
	callbackPath: string;
	serviceIdentity: ServiceIdentity;
}
