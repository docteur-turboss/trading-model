import { Router } from 'express';
import { MessageController } from './messages.controller';

/** Creates an Express route to receive broker message callbacks.
 *
 * @param callbackpath - The URL path for the callback route
 * @returns An Express router with the POST route configured
 */
export const CreateCallbackRoute = (callbackpath: string) =>
  Router().post(callbackpath, MessageController);
