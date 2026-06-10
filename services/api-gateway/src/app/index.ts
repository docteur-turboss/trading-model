import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';

createBootstrap({
  name: 'ApiGateway',
  createServer,
});
