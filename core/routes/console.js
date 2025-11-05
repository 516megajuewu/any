const registry = require('../registry');
const consoleManager = require('../consoleManager');

async function consoleRoutes(fastify) {
  fastify.post('/api/apps/:id/console', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    const { shell, env, cols, rows, token } = request.body || {};

    try {
      const session = consoleManager.createSession(id, {
        shell,
        env: env || { cwd: app.cwd },
        cols,
        rows,
        token
      });

      reply.code(201);
      return {
        sessionId: session.sessionId,
        shell: session.shell,
        cols: session.cols,
        rows: session.rows,
        created: session.created,
        token: session.token
      };
    } catch (error) {
      if (error.message.includes('Maximum')) {
        reply.code(429);
        return { error: error.message };
      }
      reply.code(500);
      return { error: error.message };
    }
  });

  fastify.get('/api/console/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const session = consoleManager.getSession(sessionId);

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    return { session };
  });

  fastify.delete('/api/console/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const session = consoleManager.getSession(sessionId);

    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const destroyed = consoleManager.destroySession(sessionId, 'client-request');

    if (!destroyed) {
      reply.code(410);
      return { error: 'Session already terminated' };
    }

    return { success: true, sessionId };
  });

  fastify.get('/api/apps/:id/consoles', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    const sessions = consoleManager.getSessionsByApp(id);
    return { sessions };
  });

  fastify.get('/api/console', async () => {
    const sessions = consoleManager.listSessions();
    return { sessions };
  });
}

module.exports = consoleRoutes;
