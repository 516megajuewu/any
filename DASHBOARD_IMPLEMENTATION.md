# Dashboard Implementation

## Overview

This document describes the Vue 3 dashboard implementation with draggable app cards, real-time WebSocket updates for status and metrics, and interactive controls.

## Features Implemented

### 1. App Cards
- **AppCard.vue**: Displays individual app information with:
  - Status indicator (colored dot and badge)
  - App name, type (Node.js/Python/CLI)
  - Control buttons: Start, Stop, Restart
  - Dropdown menu: Install dependencies, Delete app
  - Real-time metrics display: CPU, Memory, Restarts
  - Error message display
  - PID display when running

### 2. Draggable Grid
- **DashboardGrid.vue**: Responsive grid layout using `vuedraggable` (SortableJS wrapper)
  - Drag-and-drop to reorder apps
  - Order persisted to `localStorage` as `app-card-order`
  - Responsive grid: auto-fills with minimum 320px width per card
  - Mobile-friendly: single column on small screens

### 3. Real-time Updates
- **stores/apps.ts**: Pinia store managing app state with:
  - WebSocket integration via `attachWebSocket()`
  - Handles `app.list`, `app.status`, `app.metrics`, `app.logs` events
  - Optimistic updates for UI responsiveness
  - Metrics history tracking (60 data points per app)
  - Auto-reconnect support

### 4. Modals & Drawers
- **FileDrawer.vue**: Lazy-loaded drawer for file management (placeholder until file service is ready)
- **ConsoleModal.vue**: Lazy-loaded modal for viewing app logs
  - Subscribes to `app.logs` WebSocket events
  - Displays stdout/stderr with timestamps
  - Color-coded stream types
  - Supports up to 500 log entries per session
  - Properly cleans up subscriptions on close

### 5. Dashboard View
- **DashboardView.vue**: Main dashboard layout with:
  - Toolbar with Refresh and Add App buttons
  - Empty state for no apps
  - Loading state
  - Create app dialog (name, type, cwd, startCmd)
  - Install dependencies dialog (manager, args)
  - Error alerts with toast notifications

### 6. Interactions
- **Double-click app card**: Opens file drawer (placeholder)
- **Middle-click app card**: Opens console modal with live logs
- **Start/Stop/Restart buttons**: Invoke backend API endpoints
- **Delete**: Confirmation dialog before deletion
- **Install**: Opens dialog to select package manager and arguments

## API Integration

All operations call the backend REST API:
- `GET /api/apps` - Fetch apps list
- `POST /api/apps` - Create app
- `PATCH /api/apps/:id` - Update app (not used in UI yet)
- `DELETE /api/apps/:id` - Delete app
- `POST /api/apps/:id/start` - Start app
- `POST /api/apps/:id/stop` - Stop app
- `POST /api/apps/:id/restart` - Restart app
- `POST /api/apps/:id/install` - Install dependencies

## WebSocket Events

The frontend subscribes to and handles:
- `app.list` - Full apps list update
- `app.status` - Individual app status change (running/stopped/error)
- `app.metrics` - Metrics update (CPU/Memory)
- `app.logs` - Log line (stdout/stderr)

## Styling

- Dark theme with glassmorphic cards
- Status colors:
  - **Green**: Running
  - **Red**: Error/Crashed
  - **Yellow/Orange**: Starting
  - **Gray**: Stopped
- Smooth transitions and hover effects
- Responsive design with mobile support

## Dependencies Added

```json
{
  "vuedraggable": "^4.1.0"
}
```

## File Structure

```
frontend/src/
├── components/
│   ├── AppCard.vue          # Individual app card with controls
│   ├── DashboardGrid.vue    # Draggable grid layout
│   ├── FileDrawer.vue       # File browser drawer (placeholder)
│   └── ConsoleModal.vue     # Console logs modal
├── stores/
│   ├── app.ts              # Existing app store (health, events)
│   └── apps.ts             # New apps store (apps list, WS, CRUD)
├── views/
│   └── DashboardView.vue   # Main dashboard view (updated)
└── services/
    ├── api.ts              # Axios client
    └── events.ts           # WebSocket client
```

## Usage

1. Start the backend: `npm start`
2. Navigate to the dashboard (already the default route)
3. Click "Add app" to create an app
4. Use the control buttons to manage app lifecycle
5. Double-click a card to open the file drawer
6. Middle-click a card to open the console with live logs
7. Drag cards to reorder them (persists to localStorage)

## Future Enhancements

- File service integration for FileDrawer
- PTY support for interactive console input
- Persist card order to backend (`./data/settings.json`)
- Sparkline charts for metrics history
- Edit app dialog
- Bulk operations (start all, stop all)
- App templates/presets
