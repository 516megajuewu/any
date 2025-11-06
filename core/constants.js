/**
 * Application-wide constants and configuration
 */

module.exports = {
  // Server configuration
  SERVER: {
    DEFAULT_PORT: 3000,
    DEFAULT_HOST: '0.0.0.0',
    LOG_LEVEL_DEV: 'debug',
    LOG_LEVEL_PROD: 'info'
  },

  // WebSocket configuration
  WEBSOCKET: {
    PATH: '/ws',
    HEARTBEAT_INTERVAL: 30000,
    RECONNECT_INTERVAL: 5000
  },

  // Process management
  PROCESS: {
    RESTART_DELAY: 250,
    STOP_SIGNAL: 'SIGTERM',
    KILL_SIGNAL: 'SIGKILL',
    KILL_TIMEOUT: 10000
  },

  // Console/PTY configuration
  CONSOLE: {
    MAX_SESSIONS_PER_APP: 3,
    INACTIVITY_TIMEOUT: 1800000, // 30 minutes
    DEFAULT_COLS: 80,
    DEFAULT_ROWS: 24,
    OUTPUT_BUFFER_SIZE: 1000
  },

  // File management
  FILES: {
    MAX_UPLOAD_SIZE: 100 * 1024 * 1024, // 100MB
    CHUNK_SIZE: 64 * 1024, // 64KB
    ALLOWED_EXTENSIONS: ['.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml', '.env']
  },

  // Hot reload configuration
  HOT_RELOAD: {
    DEBOUNCE_DELAY: 100,
    RELOAD_TIMEOUT: 5000,
    WATCH_EXTENSIONS: ['.js', '.json']
  },

  // Metrics configuration
  METRICS: {
    COLLECTION_INTERVAL: 5000,
    HISTORY_SIZE: 60,
    CPU_THRESHOLD_WARNING: 80,
    MEMORY_THRESHOLD_WARNING: 90
  },

  // Log configuration
  LOGS: {
    BUFFER_SIZE: 500,
    BATCH_SIZE: 10,
    FLUSH_INTERVAL: 1000
  },

  // Default settings
  DEFAULT_SETTINGS: {
    ui: {
      theme: 'dark'
    },
    pkgManagers: {
      node: 'npm',
      python: 'pip'
    },
    pipIndex: null,
    allowRootBrowse: false,
    authToken: null
  },

  // App types
  APP_TYPES: ['node', 'python', 'cli'],

  // Status values
  STATUS: {
    STOPPED: 'stopped',
    STARTING: 'starting',
    RUNNING: 'running',
    STOPPING: 'stopping',
    ERROR: 'error',
    INSTALLING: 'installing'
  },

  // Error codes
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    FORBIDDEN: 'FORBIDDEN',
    UNAUTHORIZED: 'UNAUTHORIZED'
  },

  // MIME types
  MIME_TYPES: {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
  }
};
