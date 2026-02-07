# MCP SSE Bridge

A local bridge server that allows browser extensions to connect to stdio-based MCP servers (like `php artisan boost:mcp`) using SSE (Server-Sent Events) transport.

**Built with the official [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)** for production-ready, type-safe MCP protocol handling.

## How It Works

```
Extension (SSE) → Bridge (localhost:3000) → stdio → php artisan boost:mcp
```

The bridge uses:
- **SSEServerTransport** - handles SSE communication with the browser
- **StdioServerTransport** - handles stdio communication with the spawned MCP process
- Message forwarding between both transports

## Installation

```bash
cd ~/Public/mcp-bridge-ts
npm install
# or
pnpm install
```

## Build

```bash
npm run build
# or
pnpm build
```

## Development Scripts

```bash
# Type checking
npm run types

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Run all checks
npm run check

# Watch mode
npm run watch
```

## Run

```bash
npm start
# or
pnpm start
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
   - **URL**: `http://localhost:3000/sse?command=php&args=["artisan","boost:mcp"]&cwd=/path/to/laravel`
   - **Transport**: `sse`
4. Click "Connect"

## API

### GET /sse

Open SSE stream and spawn MCP server process.

Query Parameters:
- `command`: Command to spawn (e.g., `php`) - required
- `args`: JSON array of arguments (e.g., `["artisan","boost:mcp"]`) - optional
- `cwd`: Working directory - optional

Returns:
- SSE stream with `endpoint` event containing session URL
- Async `message` events for notifications and responses

### POST /sse

Send JSON-RPC messages to the MCP server.

Query Parameters:
- `sessionId`: Session ID from the initial GET request - required

Body:
- JSON-RPC message object

Returns:
- 202 Accepted (responses come via SSE stream)

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
