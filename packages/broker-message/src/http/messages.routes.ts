import { Router } from "express"
import { MessageController } from "./messages.controller"

export const CreateCallbackRoute = (callbackpath: string) => Router().post(callbackpath, MessageController);