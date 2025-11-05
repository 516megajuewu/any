const pidusage = require('pidusage');

async function getProcessMetrics(pid) {
  if (!pid || typeof pid !== 'number') {
    return null;
  }

  try {
    const stats = await pidusage(pid);
    return {
      cpu: stats.cpu,
      memory: stats.memory,
      uptime: stats.elapsed,
      timestamp: Date.now()
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function resetMetrics(pid) {
  if (pid) {
    pidusage.clear(pid);
    return;
  }
  pidusage.clear();
}

module.exports = {
  getProcessMetrics,
  resetMetrics
};
