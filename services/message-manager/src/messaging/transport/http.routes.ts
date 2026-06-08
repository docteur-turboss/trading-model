import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';

import { SubscriptionToATopic, DeleteASubscription, PublishAMessage } from './http.controller';
import { PublishSchema, SubscribeSchema, UnsubscribeSchema } from './validation/broker.schema';
import { validateSchema } from './validation/validate-schema.middleware';
import { Dispatcher } from '../core/dispatcher';

const PUBLISH_TIMEOUT_MS = 30_000;
const SUBSCRIPTION_TIMEOUT_MS = 10_000;

const publishLimiter = rateLimit({
  windowMs: 60_000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many publications, please try again later' },
});

const subscribeLimiter = rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many subscription requests, please try again later' },
});

const unsubscribeLimiter = rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many unsubscription requests, please try again later' },
});

const withTimeout = (ms: number) => (req: Request, _res: Response, next: NextFunction) => {
  req.setTimeout(ms);
  next();
};

export const BrokerRoutes = (dispatcher: Dispatcher): Router => {
  const router = Router();

  router.post(
    '/message',
    withTimeout(PUBLISH_TIMEOUT_MS),
    publishLimiter,
    validateSchema(PublishSchema),
    PublishAMessage(dispatcher)
  );
  router.post(
    '/subscription',
    withTimeout(SUBSCRIPTION_TIMEOUT_MS),
    subscribeLimiter,
    validateSchema(SubscribeSchema),
    SubscriptionToATopic(dispatcher)
  );
  router.delete(
    '/subscription',
    withTimeout(SUBSCRIPTION_TIMEOUT_MS),
    unsubscribeLimiter,
    validateSchema(UnsubscribeSchema),
    DeleteASubscription(dispatcher)
  );

  return router;
};
