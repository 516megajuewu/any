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
