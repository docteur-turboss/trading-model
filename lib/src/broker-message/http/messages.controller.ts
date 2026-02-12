import { MessageMetadataSchema, MessagePayloadSchema } from "../shared/helper/messages/message.shema";
import { ResponseException } from "middleware/responseException";
import { EventManager } from "../client/eventManagerClient";
import { catchSync } from "middleware/catchError";
import { EventMap } from "config/event.types";

export const MessageController = catchSync(async (req) => {
    const metadata = req.body.metadata;
    const payload = req.body.payload;

    const resultMetadata = await MessageMetadataSchema.safeParseAsync(metadata);
    if(!resultMetadata.success) throw ResponseException(resultMetadata.error!.issues[0].message).BadRequest();

    const resultPayload = await MessagePayloadSchema.safeParseAsync({
        type: resultMetadata.data.topic,
        data: payload
    });

    if(!resultPayload.success) throw ResponseException("Invalid payload format").BadRequest();

    EventManager.emit(resultMetadata.data.topic as keyof EventMap, payload);
})