const registry = require('../registry');
const metrics = require('../metrics');

async function metricsRoutes(fastify) {
  fastify.get('/api/apps/:id/metrics', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    const snapshot = metrics.getSnapshot(id);
    if (!snapshot) {
      reply.code(404);
      return { error: 'No metrics available' };
    }

    return { appId: id, metrics: snapshot };
  });
}

module.exports = metricsRoutes;
