# Changelog

## [0.2.0] - 2024-11-05

### Added

#### Interactive Console (PTY)
- Full PTY console support via `node-pty` with per-app session management
- Backend console manager with lifecycle management, session limits, and inactivity timeouts
- WebSocket channels for real-time console I/O (`console:sessionId`)
- REST API endpoints:
  - `POST /api/apps/:id/console` - Create new console session
  - `GET /api/console/:sessionId` - Get session info
  - `DELETE /api/console/:sessionId` - Close session
  - `GET /api/apps/:id/consoles` - List app sessions
  - `GET /api/console` - List all sessions
- Frontend `ConsoleModal.vue` with xterm.js integration
  - Real-time terminal I/O with full ANSI support
  - Resize handling and terminal fitting
  - Ctrl+C support and clear functionality
  - Session info badges (session ID, shell type)
  - Auto-cleanup on app stop
- Cross-platform shell detection (PowerShell on Windows, bash/zsh on Unix)

#### Core Hot Reload
- Enhanced `hotReload.js` with debouncing and batch processing
- Detailed reload events with:
  - List of changed files
  - Successfully reloaded modules
  - Failed modules with error messages
  - Human-readable summary
- WebSocket broadcast of `core:reloaded` events to all clients
- Frontend toast notifications showing reloaded modules
- Automatic require cache invalidation

#### Settings Panel
- Backend settings persistence to `data/settings.json`
- REST API endpoints:
  - `GET /api/settings` - Get current settings
  - `PUT /api/settings` - Update settings
- Settings schema:
  - `pkgManagers.node` - npm/yarn/pnpm
  - `pkgManagers.python` - pip/pip3/poetry
  - `pipIndex` - Custom PyPI index URL
  - `ui.theme` - dark/light/auto theme
  - `allowRootBrowse` - File browser permissions
  - `authToken` - Optional API authentication (future feature)
- Frontend `SettingsView.vue`:
  - Form validation and change tracking
  - Loading skeletons
  - Success/error toasts
  - Theme preview and application
  - Reset functionality

#### UI Polish
- Consistent color palette across all views
- Status indicators with clear visual differentiation:
  - Online (green with glow)
  - Degraded (yellow with warning)
  - Offline (red)
- Loading skeletons for async content
- Smooth transitions and hover effects
- Empty states for dashboard and file browser
- Toast notifications for user actions
- Settings navigation in main menu

#### Cross-platform QA
- Smoke test suite in `scripts/qa/smoke-test.js`
- Tests cover:
  - Server health check
  - Settings CRUD operations
  - App listing
  - Package manager detection
  - Console session management
  - Platform-specific process handling
- Cross-platform process management:
  - Windows: `taskkill` for tree termination
  - Unix: SIGTERM/SIGKILL signals
  - Shell detection per platform
- NPM scripts: `qa:win` and `qa:unix`

### Changed
- Enhanced WebSocket hub with better channel management
- Improved error handling across all API endpoints
- Better separation of concerns in route handlers
- Console routes now support both REST and WebSocket communication

### Fixed
- Cross-platform path normalization
- Process cleanup on Windows systems
- WebSocket reconnection handling
- Terminal resize synchronization

### Technical Details
- Node.js 18+ required
- Dependencies added: `@xterm/xterm`, `@xterm/addon-fit`
- All console sessions limited to 3 per app
- 30-minute inactivity timeout for console sessions
- 300ms debounce on hot reload events
- File change batching for efficient module reloading

---

## [0.1.0] - Initial Release

- Basic app management
- File browser
- Process management
- Metrics tracking
- WebSocket real-time updates
