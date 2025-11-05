const registry = require('../registry');
const logBus = require('../logBus');

async function logsRoutes(fastify) {
  fastify.get('/api/apps/:id/logs', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    const lines = logBus.getBuffer(id);
    return { appId: id, lines };
  });
}

module.exports = logsRoutes;
