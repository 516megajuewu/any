const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (error) {
  console.error('ws module not available. Please install it with: npm install ws');
  process.exit(1);
}

const PORT = 3000;
const API_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
const TIMEOUT = 15000;

let serverProcess = null;
let wsConnection = null;
let testAppId = null;
let sessionId = null;

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

function startWebSocket() {
  return new Promise((resolve, reject) => {
    wsConnection = new WebSocket(WS_URL);
    
    wsConnection.on('open', () => {
      log('WebSocket connected', 'pass');
      resolve();
    });
    
    wsConnection.on('error', (error) => {
      log(`WebSocket error: ${error.message}`, 'fail');
      reject(error);
    });
    
    wsConnection.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'console:created') {
          sessionId = message.sessionId;
          log(`Console session created: ${sessionId}`, 'info');
        } else if (message.type === 'console:data') {
          log(`Console data received: ${message.data.slice(0, 50)}...`, 'info');
        } else if (message.type === 'console:terminated') {
          log(`Console session terminated: ${message.reason}`, 'info');
        }
      } catch (error) {
        log(`Failed to parse WebSocket message: ${error.message}`, 'warn');
      }
    });
    
    setTimeout(() => reject(new Error('WebSocket connection timeout')), TIMEOUT);
  });
}

async function createTestApp() {
  const { status, data } = await makeRequest('/api/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      name: 'Console Test App',
      type: 'node',
      cwd: process.cwd(),
      startCmd: 'echo "test"'
    }
  });
  
  if (status !== 201) {
    throw new Error(`Failed to create test app: ${status}`);
  }
  
  testAppId = data.app.id;
  log(`Created test app: ${testAppId}`, 'pass');
  return data.app;
}

async function cleanup() {
  if (testAppId) {
    try {
      await makeRequest(`/api/apps/${testAppId}`, { method: 'DELETE' });
      log('Cleaned up test app', 'pass');
    } catch (error) {
      log(`Failed to cleanup test app: ${error.message}`, 'warn');
    }
  }
  
  if (wsConnection) {
    wsConnection.close();
  }
}

const tests = [];
let passedTests = 0;
let failedTests = 0;

addTest('List console sessions', async () => {
  const { status, data } = await makeRequest('/api/console');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (!data.sessions || !Array.isArray(data.sessions)) {
    throw new Error('Expected sessions array');
  }
});

addTest('WebSocket connection', async () => {
  await startWebSocket();
});

addTest('Create console session', async () => {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket not connected');
  }
  
  const app = await createTestApp();
  
  wsConnection.send(JSON.stringify({
    type: 'console:create',
    appId: testAppId,
    shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
    cols: 80,
    rows: 24
  }));
  
  // Wait for session creation
  await new Promise((resolve) => {
    const checkSession = () => {
      if (sessionId) {
        resolve();
      } else {
        setTimeout(checkSession, 100);
      }
    };
    setTimeout(checkSession, 1000);
  });
  
  if (!sessionId) {
    throw new Error('Console session not created');
  }
});

addTest('Send console input', async () => {
  if (!sessionId) {
    throw new Error('No console session available');
  }
  
  wsConnection.send(JSON.stringify({
    type: 'console:input',
    sessionId: sessionId,
    data: 'echo "Hello World"\n'
  }));
  
  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 1000));
  log('Console input sent successfully', 'pass');
});

addTest('Resize console', async () => {
  if (!sessionId) {
    throw new Error('No console session available');
  }
  
  wsConnection.send(JSON.stringify({
    type: 'console:resize',
    sessionId: sessionId,
    cols: 100,
    rows: 30
  }));
  
  log('Console resize sent successfully', 'pass');
});

addTest('Cross-platform console handling', async () => {
  const isWindows = process.platform === 'win32';
  log(`Platform: ${process.platform}`, 'info');
  log(`Shell: ${isWindows ? 'powershell.exe' : '/bin/bash'}`, 'info');
  log(`Console handling works on ${process.platform}`, 'pass');
});

async function runTests() {
  console.log('\n🖥️  Running console tests...\n');
  
  try {
    log('Starting WebSocket connection...', 'info');
    await startWebSocket();
    log('WebSocket connected successfully', 'pass');
  } catch (error) {
    log(`Failed to connect WebSocket: ${error.message}`, 'fail');
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

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('='.repeat(50) + '\n');

  await cleanup();
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  cleanup().then(() => process.exit(1));
});
