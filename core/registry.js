const path = require('path');
const fs = require('fs-extra');
const { nanoid } = require('nanoid');

const DATA_FILE = path.join(__dirname, '..', 'data', 'apps.json');

let apps = [];
let pendingWrite = null;

async function load() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    apps = JSON.parse(raw);

    if (!Array.isArray(apps)) {
      apps = [];
    }

    for (const app of apps) {
      if (app.status === 'running') {
        app.status = 'stopped';
        app.pid = null;
      }
    }

    await persist();
  } catch (error) {
    if (error.code === 'ENOENT') {
      apps = [];
      await persist();
      return;
    }
    throw error;
  }
}

async function persist() {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
  }

  pendingWrite = setTimeout(async () => {
    pendingWrite = null;
    const tmpFile = `${DATA_FILE}.tmp`;
    await fs.ensureDir(path.dirname(DATA_FILE));
    await fs.writeFile(tmpFile, JSON.stringify(apps, null, 2), 'utf8');
    await fs.rename(tmpFile, DATA_FILE);
  }, 100);
}

function list() {
  return apps.slice();
}

function get(id) {
  return apps.find((app) => app.id === id);
}

function create(data) {
  const now = Date.now();
  const app = {
    id: nanoid(10),
    name: data.name || 'Untitled',
    type: data.type || 'node',
    cwd: data.cwd || process.cwd(),
    startCmd: data.startCmd || '',
    env: data.env || {},
    status: 'stopped',
    pid: null,
    createdAt: now,
    updatedAt: now,
    metricsSnapshot: null
  };

  apps.push(app);
  persist();
  return app;
}

function update(id, changes) {
  const index = apps.findIndex((app) => app.id === id);
  if (index === -1) {
    return null;
  }

  const updated = {
    ...apps[index],
    ...changes,
    id: apps[index].id,
    createdAt: apps[index].createdAt,
    updatedAt: Date.now()
  };

  apps[index] = updated;
  persist();
  return updated;
}

function remove(id) {
  const index = apps.findIndex((app) => app.id === id);
  if (index === -1) {
    return false;
  }

  apps.splice(index, 1);
  persist();
  return true;
}

function updateStatus(id, status, extraData = {}) {
  return update(id, { status, ...extraData });
}

function updateMetrics(id, metrics) {
  return update(id, { metricsSnapshot: metrics });
}

module.exports = {
  load,
  persist,
  list,
  get,
  create,
  update,
  remove,
  updateStatus,
  updateMetrics
};
