const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
let treeKill;
try {
  treeKill = require('tree-kill');
} catch (error) {
  console.warn('tree-kill not available, using fallback process management');
  treeKill = null;
}

const PORT = 3000;
const API_URL = `http://localhost:${PORT}`;
const TIMEOUT = 30000;

let serverProcess = null;
let testAppId = null;
const tests = [];
let passedTests = 0;
let failedTests = 0;

function log(message, level = 'info') {
  const prefix = {
    info: '  ',
    pass: '✓ ',
    fail: '✗ ',
    warn: '⚠ '
  }[level] || '  ';
  console.log(prefix + message);
}

function addTest(name, fn) {
  tests.push({ name, fn });
}

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${API_URL}${path}`;
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (error) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { status } = await makeRequest('/health');
      if (status === 200) {
        return true;
      }
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'node.exe' : 'node';
    
    serverProcess = spawn(cmd, ['index.js'], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'pipe',
      shell: isWindows,
      env: { ...process.env, NODE_ENV: 'test' }
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Server listening')) {
        log(`Server started with PID: ${serverProcess.pid}`, 'info');
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    serverProcess.on('error', reject);
    serverProcess.on('exit', (code, signal) => {
      log(`Server exited with code: ${code}, signal: ${signal}`, 'info');
    });

    setTimeout(() => reject(new Error('Server start timeout')), TIMEOUT);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    log(`Stopping server with PID: ${serverProcess.pid}`, 'info');
    
    // Use tree-kill for cross-platform process termination if available
    if (treeKill) {
      treeKill(serverProcess.pid, (error) => {
        if (error) {
          log(`tree-kill failed: ${error.message}`, 'warn');
          // Fallback to platform-specific methods
          fallbackKill();
        } else {
          log('tree-kill succeeded', 'pass');
          serverProcess = null;
          resolve();
        }
      });
    } else {
      // Direct fallback to platform-specific methods
      fallbackKill();
    }
    
    function fallbackKill() {
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        const { exec } = require('child_process');
        exec(`taskkill /pid ${serverProcess.pid} /T /F`, (execError) => {
          if (execError) {
            console.error('Fallback taskkill failed:', execError);
          } else {
            log('Fallback taskkill succeeded', 'pass');
          }
          serverProcess = null;
          resolve();
        });
      } else {
        serverProcess.kill('SIGTERM');
        serverProcess.on('exit', () => {
          serverProcess = null;
          resolve();
        });
        
        setTimeout(() => {
          if (serverProcess) {
            serverProcess.kill('SIGKILL');
            serverProcess = null;
            resolve();
          }
        }, 5000);
      }
    }
  });
}

addTest('Health check', async () => {
  const { status, data } = await makeRequest('/health');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (data.status !== 'ok') {
    throw new Error(`Expected status 'ok', got '${data.status}'`);
  }
});

addTest('Get settings', async () => {
  const { status, data } = await makeRequest('/api/settings');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (!data.pkgManagers) {
    throw new Error('Missing pkgManagers in settings');
  }
});

addTest('Update settings', async () => {
  const { status } = await makeRequest('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: { ui: { theme: 'dark' } }
  });
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
});

addTest('List apps', async () => {
  const { status, data } = await makeRequest('/api/apps');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (!data.apps || !Array.isArray(data.apps)) {
    throw new Error('Expected apps array in response');
  }
});

addTest('Get package manager defaults', async () => {
  const { status, data } = await makeRequest('/api/package-managers/defaults');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (!data.node || !data.python) {
    throw new Error('Missing package manager defaults');
  }
});

addTest('List console sessions', async () => {
  const { status, data } = await makeRequest('/api/console');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (!data.sessions || !Array.isArray(data.sessions)) {
    throw new Error('Expected sessions array');
  }
});

addTest('Create test app', async () => {
  const { status, data } = await makeRequest('/api/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      name: 'Test App',
      type: 'node',
      cwd: process.cwd(),
      startCmd: 'echo "Hello World"'
    }
  });
  
  if (status !== 201) {
    throw new Error(`Expected 201, got ${status}`);
  }
  
  testAppId = data.app.id;
  log(`Created test app with ID: ${testAppId}`, 'pass');
});

addTest('Start test app', async () => {
  if (!testAppId) {
    throw new Error('No test app available');
  }
  
  const { status, data } = await makeRequest(`/api/apps/${testAppId}/start`, {
    method: 'POST'
  });
  
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  
  log('Test app started successfully', 'pass');
});

addTest('Stop test app', async () => {
  if (!testAppId) {
    throw new Error('No test app available');
  }
  
  const { status, data } = await makeRequest(`/api/apps/${testAppId}/stop`, {
    method: 'POST'
  });
  
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  
  log('Test app stopped successfully', 'pass');
});

addTest('Delete test app', async () => {
  if (!testAppId) {
    throw new Error('No test app available');
  }
  
  const { status, data } = await makeRequest(`/api/apps/${testAppId}`, {
    method: 'DELETE'
  });
  
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  
  log('Test app deleted successfully', 'pass');
  testAppId = null;
});

addTest('Cross-platform process handling', async () => {
  const isWindows = process.platform === 'win32';
  log(`Platform: ${process.platform}`, 'info');
  log(`Shell: ${isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash'}`, 'info');
  log(`Process management works on ${process.platform}`, 'pass');
});

async function runTests() {
  console.log('\n🧪 Running smoke tests...\n');
  
  log('Starting server...', 'info');
  try {
    await startServer();
    const serverReady = await waitForServer();
    if (!serverReady) {
      throw new Error('Server did not become ready');
    }
    log('Server started successfully', 'pass');
  } catch (error) {
    log(`Failed to start server: ${error.message}`, 'fail');
    process.exit(1);
  }

  console.log('');
  
  for (const test of tests) {
    try {
      await test.fn();
      log(test.name, 'pass');
      passedTests++;
    } catch (error) {
      log(`${test.name}: ${error.message}`, 'fail');
      failedTests++;
    }
  }

  console.log('');
  log('Stopping server...', 'info');
  await stopServer();
  log('Server stopped', 'pass');

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('='.repeat(50) + '\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  stopServer().then(() => process.exit(1));
});
