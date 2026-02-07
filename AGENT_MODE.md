# MCP Agent Implementation - Phase 1 Complete ✅

## What's Been Implemented

Phase 1 of the MCP Agent implementation is now complete! The bridge now supports **two modes**:

### 1. Bridge Mode (Original - Backward Compatible)
- Forwards messages to external MCP servers via stdio
- Endpoint: `/sse`
- Use case: Connect to external MCP servers like `php artisan boost:mcp`

### 2. Agent Mode (New - Self-Contained)
- Built-in file operations and command execution
- Endpoint: `/agent`
- Use case: Direct file and command operations without external servers

---

## Agent Mode Features

### File System Tools (Read-only)
- ✅ `read_file` - Read file contents
- ✅ `list_directory` - List directory contents
- ✅ `search_files` - Search for text in files using grep

### File System Tools (Write/Delete)
- ✅ `write_file` - Write/create files
- ✅ `edit_file` - Edit files with search and replace
- ✅ `create_directory` - Create directories
- ✅ `delete_file` - Delete files

### Command Execution
- ✅ `execute_command` - Execute shell commands with whitelist validation

### Security Features
- ✅ Path validation (allowed/denied paths)
- ✅ Command whitelist
- ✅ File size limits (default 10MB)
- ✅ Command timeout (default 30s)
- ✅ Path traversal prevention
- ✅ Configuration system (global + per-workspace)

---

## Usage

### Starting the Server

```bash
npm run build
npm start
```

### Bridge Mode (Original)

Connect to external MCP server:
```
http://localhost:3000/sse?command=php&args=["artisan","boost:mcp"]&cwd=/path/to/laravel
```

### Agent Mode (New)

Connect with built-in tools:
```
http://localhost:3000/agent?workspace=/path/to/project
```

---

## Configuration

### Global Configuration

Create `~/.mcp-agent.json`:

```json
{
  "version": "1.0.0",
  "permissions": {
    "allowedPaths": ["~/Projects", "~/Documents"],
    "deniedPaths": ["/etc", "/sys", "~/.ssh"],
    "allowedCommands": ["ls", "grep", "find", "cat", "git", "npm"],
    "enableCommandExecution": true
  },
  "limits": {
    "maxFileSize": 10485760,
    "commandTimeout": 30000
  }
}
```

### Per-Workspace Configuration

Create `.mcp-agent.json` in your project root:

```json
{
  "version": "1.0.0",
  "permissions": {
    "allowedPaths": ["./"],
    "allowedCommands": ["npm", "git", "ls", "grep"],
    "maxFileSize": 5242880
  }
}
```

**Priority**: Workspace config > Global config > Defaults

---

## Testing

### Test File Operations

1. Start the server: `npm start`
2. Connect from Claude.ai via browser extension to:
   ```
   http://localhost:3000/agent?workspace=/path/to/your/project
   ```
3. Enable "Read-only tools" in Claude.ai settings
4. Ask Claude to:
   - "Show me the contents of package.json"
   - "List files in the src directory"
   - "Search for TODO comments in the project"

### Test Write Operations

1. Enable "Write/delete tools" in Claude.ai settings
2. Ask Claude to:
   - "Create a new file called test.txt with 'Hello World'"
   - "Edit test.txt and replace 'Hello' with 'Hi'"
   - "Delete test.txt"

### Test Command Execution

1. Ask Claude to:
   - "Run 'ls -la' in the current directory"
   - "Run 'git status'"
   - "Run 'npm list'"

### Test Security

1. Try accessing denied path: "Read /etc/passwd" (should fail)
2. Try running blocked command: "Run 'rm -rf /'" (should fail)
3. Try path traversal: "Read ../../../etc/passwd" (should fail)

---

## Architecture

### Current Structure

```
src/
├── index.ts                     # Main entry with /sse and /agent endpoints
├── server/
│   └── agent.ts                # McpServer setup and tool registration
├── tools/
│   ├── filesystem.ts           # File operation tools
│   └── commands.ts             # Command execution tools
├── security/
│   ├── validator.ts            # Path validation
│   └── command-validator.ts    # Command validation
└── config/
    ├── types.ts                # Configuration types
    ├── defaults.ts             # Default configuration
    └── loader.ts               # Config file loader
```

### How It Works

```
Browser Extension → SSEServerTransport → McpServer (with built-in tools) → File System / Commands
```

**Key Components:**

1. **SSEServerTransport**: Handles SSE communication with browser
2. **McpServer**: Registers and executes tools
3. **PathValidator**: Validates file paths against allowed/denied lists
4. **CommandValidator**: Validates commands against whitelist
5. **Config Loader**: Loads global and workspace-specific configs

---

## Next Steps (Future Phases)

### Phase 2: Git Integration
- `git_status`, `git_log`, `git_diff` (read-only)
- `git_add`, `git_commit`, `git_push` (write)

### Phase 3: Project Analysis
- `get_project_structure` - Get file tree
- `analyze_project` - Detect language/framework
- `find_files` - Find files by pattern

### Phase 4: Code Formatting
- `format_code` - Format with prettier/eslint
- `lint_code` - Run linter
- `fix_lint_issues` - Auto-fix issues

---

## Security Considerations

### Built-in Protections

1. **Path Traversal Prevention**: All paths resolved to absolute paths
2. **Command Injection Prevention**: Using `spawn()` with args array
3. **File Size Limits**: Prevents reading huge files
4. **Command Timeout**: Kills long-running commands
5. **Whitelist-based**: Only allowed commands can execute
6. **Denied Paths**: System directories blocked by default

### Claude.ai Permission Integration

The agent leverages Claude.ai's built-in permission system:

- **Read-only tools**: User enables in Claude.ai settings
- **Write/delete tools**: Requires explicit user approval
- **No runtime dialogs needed**: Claude.ai handles user consent

---

## Troubleshooting

### Build Errors

```bash
npm run build
```

If you see TypeScript errors, ensure all dependencies are installed:
```bash
npm install
```

### Connection Issues

Check that the server is running:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "bridgeSessions": 0,
  "agentSessions": 0,
  "sessions": {
    "bridge": [],
    "agent": []
  }
}
```

### Permission Errors

If you get "Access denied" errors:

1. Check your config file (`~/.mcp-agent.json`)
2. Ensure the path is in `allowedPaths`
3. Ensure the path is NOT in `deniedPaths`
4. Check that the workspace parameter is correct

### Command Not Allowed

If you get "Command not allowed" errors:

1. Check `allowedCommands` in your config
2. Add the command to the whitelist
3. Restart the server

---

## Contributing

This is Phase 1 of the implementation. Future contributions welcome for:

- Git integration tools
- Project analysis tools
- Code formatting tools
- Additional security features
- Performance improvements

---

## License

Same as the original mcp-bridge-ts project.
