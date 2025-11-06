/**
 * Utility functions for common operations
 */

const path = require('path');
const fs = require('fs');
const { DEFAULT_SETTINGS } = require('./constants');

/**
 * Safely parse JSON with fallback
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return fallback;
  }
}

/**
 * Read and parse JSON file with fallback
 */
async function readJsonFile(filePath, fallback = null) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return safeJsonParse(raw, fallback);
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Write JSON file atomically
 */
async function writeJsonFile(filePath, data, options = {}) {
  const { pretty = true } = options;
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  
  const tempPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tempPath, content, 'utf8');
  await fs.promises.rename(tempPath, filePath);
}

/**
 * Deep merge objects
 */
function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Check if value is a plain object
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Debounce function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Sleep/delay utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (bytes === null || bytes === undefined) return 'N/A';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format milliseconds to human readable duration
 */
function formatDuration(ms) {
  if (ms === null || ms === undefined || ms < 0) return 'N/A';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Sanitize path to prevent directory traversal
 */
function sanitizePath(inputPath) {
  const normalized = path.normalize(inputPath);
  return normalized.replace(/^([/\\]+|\.\.(?:[/\\]|$))+/, '');
}

/**
 * Check if path is within allowed directory
 */
function isPathWithin(targetPath, allowedDir) {
  const resolved = path.resolve(targetPath);
  const allowed = path.resolve(allowedDir);
  return resolved.startsWith(allowed);
}

/**
 * Create error with code
 */
function createError(message, code, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Validate app type
 */
function isValidAppType(type) {
  return ['node', 'python', 'cli'].includes(type);
}

/**
 * Load settings with defaults
 */
async function loadSettings(dataDir) {
  const settingsPath = path.join(dataDir, 'settings.json');
  const settings = await readJsonFile(settingsPath, DEFAULT_SETTINGS);
  return deepMerge({}, DEFAULT_SETTINGS, settings);
}

/**
 * Save settings
 */
async function saveSettings(dataDir, settings) {
  const settingsPath = path.join(dataDir, 'settings.json');
  const merged = deepMerge({}, DEFAULT_SETTINGS, settings);
  await writeJsonFile(settingsPath, merged);
  return merged;
}

/**
 * Retry operation with exponential backoff
 */
async function retry(operation, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    factor = 2,
    onRetry = () => {}
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        onRetry(error, attempt);
        await sleep(delay);
        delay = Math.min(delay * factor, maxDelay);
      }
    }
  }

  throw lastError;
}

module.exports = {
  safeJsonParse,
  readJsonFile,
  writeJsonFile,
  deepMerge,
  isObject,
  debounce,
  throttle,
  sleep,
  formatBytes,
  formatDuration,
  sanitizePath,
  isPathWithin,
  createError,
  isValidAppType,
  loadSettings,
  saveSettings,
  retry
};
