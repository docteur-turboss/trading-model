import {
  MessageMetadataSchema,
  MessagePayloadSchema,
} from '../shared/helper/messages/message.schema';
import { ResponseException } from '@trading-model/common/middleware/response-exception';
import { catchSync } from '@trading-model/common/middleware/catch-error';
import { EventMap } from '@trading-model/common/config/event.types';
import { EventManager } from '../client/event-manager-client';

export const MessageController = catchSync(async req => {
  const metadata = req.body.metadata;
  const payload = req.body.payload;

  const resultMetadata = await MessageMetadataSchema.safeParseAsync(metadata);
  if (!resultMetadata.success)
    throw ResponseException(resultMetadata.error!.issues[0].message).BadRequest();

  const resultPayload = await MessagePayloadSchema.safeParseAsync({
    type: resultMetadata.data.topic,
    data: payload,
  });

  if (!resultPayload.success) throw ResponseException('Invalid payload format').BadRequest();

  EventManager.emit(resultMetadata.data.topic as keyof EventMap, payload);
});
