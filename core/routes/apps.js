const registry = require('../registry');
const processManager = require('../processManager');
const metrics = require('../metrics');
const packageManager = require('../packageManager');
const wsHub = require('../wsHub');

function buildAppResponse(app) {
  const status = processManager.getStatus(app.id);
  const metricsSnapshot = metrics.getSnapshot(app.id);

  return {
    ...app,
    ...(status || {}),
    metricsSnapshot
  };
}

async function appsRoutes(fastify) {
  fastify.get('/api/apps', async () => {
    const apps = registry.list().map(buildAppResponse);
    return { apps };
  });

  fastify.post('/api/apps', async (request, reply) => {
    const { name, type, cwd, startCmd, env } = request.body || {};

    if (!name || typeof name !== 'string') {
      reply.code(400);
      return { error: 'name is required' };
    }

    const app = registry.create({
      name,
      type: type || 'node',
      cwd: cwd || process.cwd(),
      startCmd: startCmd || '',
      env: env && typeof env === 'object' ? env : {}
    });

    const apps = registry.list().map(buildAppResponse);
    wsHub.publishList(apps);

    reply.code(201);
    return { app: buildAppResponse(app) };
  });

  fastify.patch('/api/apps/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = registry.get(id);

    if (!existing) {
      reply.code(404);
      return { error: 'App not found' };
    }

    const status = processManager.getStatus(id);
    if (status && status.status === 'running') {
      reply.code(409);
      return { error: 'Stop the app before updating it' };
    }

    const payload = request.body || {};
    const updates = {};

    if (payload.name !== undefined) {
      if (typeof payload.name !== 'string' || !payload.name.trim()) {
        reply.code(400);
        return { error: 'Invalid name' };
      }
      updates.name = payload.name;
    }

    if (payload.type !== undefined) {
      if (!['node', 'python', 'cli'].includes(payload.type)) {
        reply.code(400);
        return { error: 'Invalid app type' };
      }
      updates.type = payload.type;
    }

    if (payload.cwd !== undefined) {
      if (typeof payload.cwd !== 'string' || !payload.cwd.trim()) {
        reply.code(400);
        return { error: 'Invalid cwd' };
      }
      updates.cwd = payload.cwd;
    }

    if (payload.startCmd !== undefined) {
      if (typeof payload.startCmd !== 'string' || !payload.startCmd.trim()) {
        reply.code(400);
        return { error: 'Invalid startCmd' };
      }
      updates.startCmd = payload.startCmd;
    }

    if (payload.env !== undefined) {
      if (payload.env && typeof payload.env === 'object') {
        updates.env = payload.env;
      } else {
        reply.code(400);
        return { error: 'env must be an object' };
      }
    }

    const updated = registry.update(id, updates);
    const apps = registry.list().map(buildAppResponse);
    wsHub.publishList(apps);

    return { app: buildAppResponse(updated) };
  });

  fastify.delete('/api/apps/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = registry.get(id);

    if (!existing) {
      reply.code(404);
      return { error: 'App not found' };
    }

    try {
      await processManager.stopApp(id);
    } catch (error) {
      fastify.log.warn({ err: error, appId: id }, 'Failed to stop app during delete');
    }

    metrics.track(id, null);
    registry.remove(id);

    const apps = registry.list().map(buildAppResponse);
    wsHub.publishList(apps);

    return { success: true, id };
  });

  fastify.post('/api/apps/:id/start', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    if (!app.startCmd) {
      reply.code(400);
      return { error: 'App has no start command configured' };
    }

    try {
      const result = processManager.startApp({
        id,
        cwd: app.cwd,
        cmd: app.startCmd,
        env: app.env
      });

      metrics.track(id, result.pid);
      const status = processManager.getStatus(id);

      return { app: buildAppResponse(registry.get(id)), result: status };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  fastify.post('/api/apps/:id/stop', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    try {
      const result = await processManager.stopApp(id);
      metrics.track(id, null);

      const status = processManager.getStatus(id) || { status: 'stopped', pid: null };

      return { app: buildAppResponse(registry.get(id)), result };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  fastify.post('/api/apps/:id/restart', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    if (!app.startCmd) {
      reply.code(400);
      return { error: 'App has no start command configured' };
    }

    try {
      const result = await processManager.restartApp(id);
      metrics.track(id, result.pid);

      const status = processManager.getStatus(id);

      return { app: buildAppResponse(registry.get(id)), result: status };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  fastify.post('/api/apps/:id/install', async (request, reply) => {
    const { id } = request.params;
    const app = registry.get(id);

    if (!app) {
      reply.code(404);
      return { error: 'App not found' };
    }

    const { manager, args = [], indexUrl } = request.body || {};

    try {
      if (app.type === 'python') {
        await packageManager.installPython(id, manager || 'pip', args, {
          cwd: app.cwd,
          env: app.env,
          indexUrl
        });
      } else if (app.type === 'cli') {
        reply.code(400);
        return { error: 'Package install not supported for CLI apps' };
      } else {
        await packageManager.installNode(id, manager || 'npm', args, {
          cwd: app.cwd,
          env: app.env
        });
      }

      return { success: true };
    } catch (error) {
      reply.code(500);
      return {
        error: error.message,
        exitCode: error.exitCode ?? null,
        signal: error.signal ?? null
      };
    }
  });
}

module.exports = appsRoutes;
