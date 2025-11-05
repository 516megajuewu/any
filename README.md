# cto.new Node.js Hello World

This repository showcases a minimal Node.js example used to validate the development workflow on cto.new.
It demonstrates how to initialize a repository, add source code, and execute it locally using Node.js.
Follow the steps below to run the sample application and confirm the end-to-end setup.

## Running the example
1. Ensure you have Node.js installed (`node --version`).
2. Run the script with `node src/index.js`.
3. You should see the output `Hello, cto.new!` in your terminal.

## Next steps
Future iterations can expand this project with tests, build tooling, or additional application features.
# Repository scaffold

This project boots a minimal Node.js backend together with a Vue 3 + Vite frontend.

## Project layout

```
core/       # Backend core modules (hot reload, process helpers, etc.)
apps/       # Placeholder for managed applications
data/       # JSON configuration and metadata
frontend/   # Vue 3 application source
html/       # Production build output served by the backend
logs/       # Runtime logs
index.js    # Backend entry point
```

## Backend

The backend uses Fastify with a lightweight WebSocket broadcast layer.

```bash
npm install
npm run dev   # Starts Fastify with dev helpers
npm start     # Starts Fastify in production mode
```

- The server listens on port `3000` by default and exposes `GET /health`.
- Static assets are served from the `html/` directory.
- During development, core module changes trigger a hot reload event broadcast over `/ws`.

### Hot Reload

When running in development mode (`npm run dev` or `NODE_ENV=development`), the backend automatically watches for changes to modules in the `core/` directory and hot-reloads them without restarting the Node process.

**How it works:**

1. The file watcher (chokidar) monitors all `.js` and `.json` files in `core/`
2. When a file changes, the module cache is cleared and the module is re-imported
3. Connected WebSocket clients receive a `core:reload` message with information about the reloaded module
4. If a reload fails (syntax error, runtime error, etc.), the previous working version is restored and a `core:error` message is broadcast

**Excluded from hot reload:**

- `hotReload.js` itself (to prevent infinite loops)
- Node modules, git files, logs, data files, and build artifacts
- Files outside the `core/` directory

**WebSocket events:**

- `core:reload` - Successful module reload with file path and event details
- `core:error` - Reload failure with error message and stack trace

**Limitations:**

- Route changes may require a manual server restart as Fastify routes are registered at startup
- Running processes managed by `processManager` are not affected by reloads
- Persistent state in modules (e.g., intervals, timers) may need manual cleanup/restart

**Manual fallback:**

If hot reload encounters issues or the server becomes unstable:

1. Stop the server with `Ctrl+C`
2. Clear the Node module cache: `rm -rf node_modules/.cache` (if applicable)
3. Restart the server with `npm run dev`

**Safeguards:**

- Reload loop detection prevents rapid successive reloads of the same module
- Failed reloads automatically restore the previous working module
- All errors are logged and broadcast to connected clients
- Debouncing prevents excessive reload attempts during rapid file changes

## Frontend

The frontend is a Vue 3 + TypeScript application that uses Vite, Element Plus, Pinia, and Vue Router.

```bash
cd frontend
npm install
npm run dev     # Starts the Vite dev server with proxying to the backend
npm run build   # Produces production assets in ../html
npm run preview # Preview the production build locally
```

Configure API and WebSocket endpoints with optional environment variables:

- `VITE_API_BASE_URL` (defaults to the Fastify server origin)
- `VITE_WS_URL` (defaults to the Fastify WebSocket endpoint)

## Data files

Two JSON files are included for initial configuration:

- `data/apps.json` – list of managed applications (empty array by default)
- `data/settings.json` – UI and package manager defaults

## Frontend deployment

Running `npm run build` inside `frontend/` outputs production files directly to `../html`. The backend can then serve the compiled UI via `/`.

## Console Feature

The backend provides interactive console sessions for apps using node-pty with WebSocket streaming.

### REST API

#### Create Console Session
```http
POST /api/apps/:id/console
Content-Type: application/json

{
  "shell": "/bin/bash",     // Optional: shell to spawn (defaults to system shell)
  "env": {                  // Optional: environment variables
    "cwd": "/path/to/dir"   // Optional: working directory (defaults to app.cwd)
  },
  "cols": 80,               // Optional: terminal columns (default: 80)
  "rows": 24,               // Optional: terminal rows (default: 24)
  "token": "auth-token"     // Optional: authentication token placeholder
}
```

**Response (201)**:
```json
{
  "sessionId": "abc123",
  "shell": "/bin/bash",
  "cols": 80,
  "rows": 24,
  "created": 1234567890
}
```

#### Get Console Session Info
```http
GET /api/console/:sessionId
```

#### Close Console Session
```http
DELETE /api/console/:sessionId
```

#### List App Consoles
```http
GET /api/apps/:id/consoles
```

#### List All Consoles
```http
GET /api/console
```

### WebSocket Protocol

Connect to `/ws` and subscribe to console output:

```json
{
  "type": "subscribe",
  "channel": "console:SESSION_ID"
}
```

#### Client → Server Messages

**Write Input to Console**:
```json
{
  "type": "console:input",
  "sessionId": "abc123",
  "data": "ls -la\n"
}
```

**Resize Console**:
```json
{
  "type": "console:resize",
  "sessionId": "abc123",
  "cols": 100,
  "rows": 30
}
```

#### Server → Client Messages

**Console Output**:
```json
{
  "type": "console:data",
  "sessionId": "abc123",
  "appId": "app-id",
  "data": "terminal output...",
  "timestamp": 1234567890
}
```

**Console Terminated**:
```json
{
  "type": "console:terminated",
  "sessionId": "abc123",
  "appId": "app-id",
  "reason": "app-stopped|process-exit|manual|inactivity-timeout",
  "exitCode": 0,
  "signal": null,
  "timestamp": 1234567890
}
```

**Console Created**:
```json
{
  "type": "console:created",
  "sessionId": "abc123",
  "appId": "app-id",
  "shell": "/bin/bash",
  "cols": 80,
  "rows": 24,
  "created": 1234567890,
  "timestamp": 1234567890
}
```

**Console Resized**:
```json
{
  "type": "console:resized",
  "sessionId": "abc123",
  "appId": "app-id",
  "cols": 100,
  "rows": 30,
  "timestamp": 1234567890
}
```

### Features

- **Multiple concurrent consoles**: Up to 3 sessions per app
- **Automatic cleanup**: Consoles are destroyed when the associated app stops
- **Inactivity timeout**: Sessions automatically close after 30 minutes of inactivity
- **Real-time streaming**: PTY output is streamed via WebSocket within 1 second
- **Terminal operations**: Full support for input, output, and resize operations

### Platform Requirements

The `node-pty` dependency requires native compilation:

**Linux/macOS**:
- Python 3.x
- `make`
- C/C++ compiler (gcc/clang)

**Windows**:
- Windows Build Tools or Visual Studio with C++ tools
- Python 3.x

**Install**:
```bash
npm install
```

If `node-pty` compilation fails, ensure build tools are installed:

- **Ubuntu/Debian**: `sudo apt-get install build-essential python3`
- **macOS**: `xcode-select --install`
- **Windows**: `npm install --global windows-build-tools`
