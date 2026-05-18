import { MessageMetadataSchema, MessagePayloadSchema } from "../shared/helper/messages/message.schema";
import { ResponseException } from "@trading-model/common/middleware/responseException";
import { EventManager } from "../client/eventManagerClient";
import { catchSync } from "@trading-model/common/middleware/catchError";
import { EventMap } from "@trading-model/common/config/event.types";

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