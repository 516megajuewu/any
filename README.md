# Control Center - Full-Stack App Manager

A polished full-stack application for managing Node.js and Python applications with interactive consoles, file management, hot reload, and cross-platform support.

## Features

### 🚀 Interactive Console (PTY)
- Full terminal emulation with xterm.js
- Real-time PTY sessions via WebSocket
- Per-app console management (up to 3 concurrent sessions)
- Ctrl+C support, terminal resize, and auto-cleanup
- Cross-platform shell support (PowerShell on Windows, bash/zsh on Unix)

### 🔥 Core Hot Reload
- Automatic module reloading on file changes
- Debounced batch processing
- Real-time notifications to frontend
- Detailed change reports with success/failure tracking

### ⚙️ Settings Panel
- Package manager configuration (npm/yarn/pnpm, pip/poetry)
- Custom PyPI index support
- Theme selection (dark/light/auto)
- File browser permissions
- Persistent settings storage

### 🎨 UI Polish
- Consistent color palette with status indicators
- Loading skeletons and smooth animations
- Empty states and error handling
- Toast notifications for user actions
- Responsive design with Element Plus

### 🧪 Cross-platform QA
- Automated smoke test suite
- Platform-specific process management
- Windows and Unix compatibility verified

This project boots a minimal Node.js backend together with a Vue 3 + Vite frontend.

## Quick Start

### Backend
```bash
npm install
npm run dev   # Development mode with hot reload
npm start     # Production mode
npm run qa:unix  # Run smoke tests (Unix/macOS)
npm run qa:win   # Run smoke tests (Windows)
```

### Frontend
```bash
cd frontend
npm install
npm run dev     # Start Vite dev server
npm run build   # Build for production (outputs to ../html)
```

### Access
- Backend API: http://localhost:3000
- Frontend (dev): http://localhost:5173
- WebSocket: ws://localhost:3000/ws
- Health check: http://localhost:3000/health

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

## Feature Tour

### Dashboard
- View all registered applications
- Start/stop/restart apps
- Real-time status indicators (running/stopped/error)
- Resource metrics (CPU/memory)
- Middle-click app card to open interactive console

### Files
- Browse project files
- Upload files and zip archives
- Download files
- View/edit files with Monaco editor
- Syntax highlighting for common languages

### Console
- Open interactive terminal sessions for each app
- Full ANSI color support
- Command history and Ctrl+C
- Terminal resize support
- Auto-cleanup on app stop

### Settings
- Configure package managers for Node.js and Python
- Set custom PyPI index
- Toggle UI theme (dark/light/auto)
- Control file browser permissions
- All settings persist to disk

### Real-time Updates
- WebSocket-based live updates
- Connection status indicator
- Automatic reconnection
- Hot reload notifications

## API Documentation

### Settings Endpoints

#### Get Settings
```http
GET /api/settings
```

Response:
```json
{
  "ui": { "theme": "dark" },
  "pkgManagers": { "node": "npm", "python": "pip" },
  "pipIndex": null,
  "allowRootBrowse": false,
  "authToken": null
}
```

#### Update Settings
```http
PUT /api/settings
Content-Type: application/json

{
  "ui": { "theme": "light" },
  "pkgManagers": { "node": "pnpm", "python": "poetry" },
  "pipIndex": "https://custom-pypi.org/simple"
}
```

### Hot Reload Events

When core modules change in development mode, the server broadcasts:

```json
{
  "type": "core:reloaded",
  "info": {
    "changedFiles": [
      { "path": "fileService.js", "event": "change" }
    ],
    "reloadedModules": ["fileService.js"],
    "failedModules": [],
    "summary": "Reloaded 1 module(s)",
    "timestamp": 1234567890
  },
  "timestamp": 1234567890
}
```

## Development

### Running Tests
```bash
npm run qa:unix   # Unix/macOS
npm run qa:win    # Windows
```

The smoke test suite verifies:
- Server health and startup
- Settings CRUD operations
- App listing
- Console session management
- Package manager detection
- Cross-platform compatibility

### Hot Reload
In development mode (`npm run dev`), the backend watches `core/**/*.js` for changes and automatically:
1. Invalidates require cache
2. Reloads modified modules
3. Broadcasts reload event to frontend
4. Shows toast notification with changed files

### Adding New Routes
1. Create route handler in `core/routes/`
2. Import and register in `index.js`
3. Routes are automatically available without restart in dev mode

## License

MIT
