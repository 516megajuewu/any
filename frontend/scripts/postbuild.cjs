#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', '..', 'html');

try {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const keepFile = path.join(outDir, '.gitkeep');
  if (!fs.existsSync(keepFile)) {
    fs.writeFileSync(keepFile, '');
  }
  console.log(`Frontend assets available in: ${outDir}`);
} catch (error) {
  console.error('Failed to prepare html output directory:', error);
  process.exitCode = 1;
}
