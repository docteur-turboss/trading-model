import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { LogRepository } from '../persistence/log-repository';

export function getLogsController(logRepo: LogRepository) {
  return {
    listLogs: catchSync(async req => {
      const result = await logRepo.query({
        serviceName: req.query.serviceName as string | undefined,
        level: req.query.level as string | undefined,
        correlationId: req.query.correlationId as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });
      return sendResponse(result, 200);
    }),

    getLogStats: catchSync(async () => {
      const stats = await logRepo.getStats();
      return sendResponse(stats, 200);
    }),

    getLogById: catchSync(async req => {
      const doc = await logRepo.getById(req.params.id);
      if (!doc) {
        return sendResponse({ error: 'Log entry not found' }, 404);
      }
      return sendResponse(doc, 200);
    }),
  };
}
