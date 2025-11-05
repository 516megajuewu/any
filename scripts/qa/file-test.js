const http = require('http');
let FormData;
try {
  FormData = require('form-data');
} catch (error) {
  console.error('form-data module not available. Please install it with: npm install form-data');
  process.exit(1);
}
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const API_URL = `http://localhost:${PORT}`;
const TIMEOUT = 15000;

const testDir = path.join(process.cwd(), 'test-temp');
const testFile = path.join(testDir, 'test.txt');
const testContent = 'Hello, World!\nThis is a test file.';

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

async function makeMultipartRequest(path, formData) {
  return new Promise((resolve, reject) => {
    const url = `${API_URL}${path}`;
    const req = http.request(url, {
      method: 'POST',
      headers: formData.getHeaders()
    }, (res) => {
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
    formData.pipe(req);
  });
}

async function setupTestFiles() {
  // Create test directory and file
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  fs.writeFileSync(testFile, testContent);
  log(`Created test file: ${testFile}`, 'info');
}

async function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
    log('Cleaned up test files', 'pass');
  }
}

const tests = [];
let passedTests = 0;
let failedTests = 0;

addTest('List files in apps directory', async () => {
  const { status, data } = await makeRequest('/api/files?base=apps');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (!data.items || !Array.isArray(data.items)) {
    throw new Error('Expected items array');
  }
});

addTest('List files in root directory (should fail)', async () => {
  const { status, data } = await makeRequest('/api/files?base=root');
  if (status !== 403) {
    throw new Error(`Expected 403 (forbidden), got ${status}`);
  }
  log('Root browsing correctly blocked', 'pass');
});

addTest('Create directory', async () => {
  await setupTestFiles();
  
  const { status, data } = await makeRequest('/api/files/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { base: 'apps', path: 'test-dir' }
  });
  
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  log('Directory created successfully', 'pass');
});

addTest('Write file', async () => {
  const { status, data } = await makeRequest('/api/files/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { 
      base: 'apps', 
      path: 'test-dir/test.txt',
      content: 'Test file content'
    }
  });
  
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  log('File written successfully', 'pass');
});

addTest('Read file', async () => {
  const { status, data } = await makeRequest('/api/files/content?base=apps&path=test-dir/test.txt');
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  if (data.content !== 'Test file content') {
    throw new Error('File content mismatch');
  }
  log('File read successfully', 'pass');
});

addTest('Upload file', async () => {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(testFile), 'uploaded.txt');
  formData.append('base', 'apps');
  formData.append('path', 'test-dir');
  
  const { status, data } = await makeMultipartRequest('/api/files/upload', formData);
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  log('File uploaded successfully', 'pass');
});

addTest('Rename file/directory', async () => {
  const { status, data } = await makeRequest('/api/files/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { 
      base: 'apps', 
      src: 'test-dir',
      dest: 'test-dir-renamed'
    }
  });
  
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  log('File/directory renamed successfully', 'pass');
});

addTest('Delete file/directory', async () => {
  const { status, data } = await makeRequest('/api/files?base=apps&path=test-dir-renamed', {
    method: 'DELETE'
  });
  
  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}`);
  }
  log('File/directory deleted successfully', 'pass');
});

addTest('Cross-platform path handling', async () => {
  const isWindows = process.platform === 'win32';
  const testPath = isWindows ? 'test\\path\\with\\backslashes' : 'test/path/with/slashes';
  
  log(`Platform: ${process.platform}`, 'info');
  log(`Test path: ${testPath}`, 'info');
  
  // Test path normalization
  const { status, data } = await makeRequest('/api/files/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { base: 'apps', path: testPath }
  });
  
  if (status !== 200) {
    throw new Error(`Path handling failed: ${status}`);
  }
  
  log('Cross-platform path handling works', 'pass');
});

async function runTests() {
  console.log('\n📁 Running file system tests...\n');
  
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
