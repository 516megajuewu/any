const { spawn } = require('child_process');
const path = require('path');

const qaDir = path.join(__dirname);
const scripts = [
  { name: 'Smoke Tests', file: 'smoke-test.js' },
  { name: 'File System Tests', file: 'file-test.js' },
  { name: 'Console Tests', file: 'console-test.js' }
];

function log(message, level = 'info') {
  const prefix = {
    info: '  ',
    pass: '✓ ',
    fail: '✗ ',
    warn: '⚠ ',
    header: '🔧 '
  }[level] || '  ';
  console.log(prefix + message);
}

async function runScript(script) {
  return new Promise((resolve) => {
    log(`Running ${script.name}...`, 'info');
    
    const child = spawn('node', [script.file], {
      cwd: qaDir,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        log(`${script.name} passed`, 'pass');
        resolve({ name: script.name, success: true });
      } else {
        log(`${script.name} failed with exit code ${code}`, 'fail');
        resolve({ name: script.name, success: false, code });
      }
    });
    
    child.on('error', (error) => {
      log(`${script.name} failed to start: ${error.message}`, 'fail');
      resolve({ name: script.name, success: false, error: error.message });
    });
  });
}

async function runAllTests() {
  console.log('🧪 Running comprehensive QA tests...\n');
  
  const results = [];
  
  for (const script of scripts) {
    const result = await runScript(script);
    results.push(result);
    console.log(''); // Add spacing between tests
  }
  
  console.log('='.repeat(60));
  console.log('🏁 QA TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    if (result.success) {
      log(result.name, 'pass');
    } else {
      log(`${result.name}: ${result.error || `Exit code ${result.code}`}`, 'fail');
    }
  });
  
  console.log('-'.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    log('All QA tests passed! 🎉', 'pass');
  } else {
    log('Some QA tests failed. Please review the output above.', 'warn');
  }
  
  console.log('='.repeat(60));
  
  return failed === 0;
}

// Check if specific test was requested
const requestedTest = process.argv[2];

if (requestedTest) {
  const script = scripts.find(s => s.file === requestedTest || s.name.toLowerCase().includes(requestedTest.toLowerCase()));
  
  if (script) {
    log(`Running specific test: ${script.name}`, 'header');
    runScript(script).then(result => {
      process.exit(result.success ? 0 : 1);
    });
  } else {
    console.error(`Test not found: ${requestedTest}`);
    console.log('Available tests:');
    scripts.forEach(s => console.log(`  - ${s.name} (${s.file})`));
    process.exit(1);
  }
} else {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error running QA tests:', error);
    process.exit(1);
  });
}
