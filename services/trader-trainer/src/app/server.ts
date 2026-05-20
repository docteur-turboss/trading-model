import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { MessageManagerListenExpress } from '../config/message-manager';
import { AddressManagerRoutes } from '../config/address-manager';
import { Trainer } from '../core/trainer';
import { env } from '../config/env';
import { ResponseException } from '@trading-model/common/middleware/response-exception';
import { catchSync } from '@trading-model/common/middleware/catch-error';

export function createServer(trainer: Trainer) {
  return createSecureServer({
    port: env.PORT,
    tls: {
      key: env.TLS_KEY_PATH,
      cert: env.TLS_CERT_PATH,
      ca: env.TLS_CA_PATH,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      limit: 100,
    },
    routes: app => {
      app.get(
        '/best-agent',
        catchSync(async (_req, res) => {
          const summary = trainer.getBestAgentSummary();
          if (!summary) {
            const response = ResponseException(
              'Aucun agent entrainé disponible pour le moment.'
            ).NotFound();
            res.status(response.status).json({ data: response.data });
            return;
          }

          res.json({
            data: {
              agent: summary,
              training: trainer.isTraining(),
              symbol: trainer.getCurrentSymbol(),
              generation: trainer.getGeneration(),
            },
          });
        })
      );

      app.get(
        '/training-status',
        catchSync(async (_req, res) => {
          res.json({
            data: {
              training: trainer.isTraining(),
              symbol: trainer.getCurrentSymbol(),
              generation: trainer.getGeneration(),
            },
          });
        })
      );

      AddressManagerRoutes(app);
      MessageManagerListenExpress(app);
    },
  });
}
