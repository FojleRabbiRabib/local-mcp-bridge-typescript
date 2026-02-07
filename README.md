# MCP StreamableHTTP Bridge

A local bridge server that allows browser extensions to connect to stdio-based MCP servers (like `php artisan boost:mcp`).

## How It Works

```
Extension (StreamableHTTP) → Bridge (localhost:3000) → stdio → php artisan boost:mcp
```

## Installation

```bash
cd ~/Public/mcp-bridge-ts
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm start
```

Or with custom configuration:

```bash
PORT=3000 ALLOWED_COMMANDS=php,node,python npm start
```

## Connecting from Extension

1. Open the MCP Bridge extension Manager
2. Click "Add Server"
3. Configure:
   - **Name**: `Laravel Boost`
   - **URL**: `http://localhost:3000/mcp`
   - **Transport**: `streamable-http`
4. Click "Connect"

## API

### POST /mcp

Send JSON-RPC messages.

Headers:
- `mcp-session-id`: Session ID (required after first request)
- `mcp-command`: Command to spawn (e.g., `php`)
- `mcp-args`: JSON array of arguments (e.g., `["artisan","boost:mcp"]`)
- `mcp-cwd`: Working directory (optional)

### GET /mcp

Open SSE stream for async responses.

Headers:
- `mcp-session-id`: Session ID (required)

### DELETE /mcp

Terminate session.

Headers:
- `mcp-session-id`: Session ID (required)

### GET /health

Health check endpoint.

## Development

```bash
# Watch mode
npm run watch

# Dev (build + run)
npm run dev
```

## Project Structure

```
mcp-bridge-ts/
├── src/
│   ├── index.ts     # Main entry point
│   ├── bridge.ts    # Express routes and bridge logic
│   └── session.ts   # Session and process management
├── build/           # Compiled output
├── package.json
└── tsconfig.json
```
