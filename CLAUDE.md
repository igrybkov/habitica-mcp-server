# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Habitica MCP Server is a Model Context Protocol (MCP) server that enables AI assistants to interact with the Habitica API. It provides tools for task management, habit tracking, pet/mount handling, shop operations, and more.

## Development Commands

```bash
# Start the server
npm start

# Development with hot reload
npm run dev

# Run publish-check before releasing
npm run publish-check
```

No test suite exists yet (`npm test` is a no-op).

## Architecture

This is a single-file MCP server (ES modules) with a simple structure:

- **`index.js`** - The entire server implementation:
  - MCP server setup using `@modelcontextprotocol/sdk`
  - Axios client configured for Habitica API v3
  - Tool definitions array (26 tools covering tasks, pets, shop, etc.)
  - Request handlers for `ListToolsRequest` and `CallToolRequest`
  - Implementation functions for each tool (one async function per tool)
  - StdioServerTransport for MCP communication

- **`i18n.js`** - Simple i18n helper with `t(en, zh)` function for English/Chinese translations. Language is set via `MCP_LANG` or `LANG` environment variable.

## Key Patterns

**Tool Definition Format:**
```javascript
{
  name: 'tool_name',
  description: t('English description', '中文描述'),
  inputSchema: { type: 'object', properties: {...}, required: [...] }
}
```

**Tool Implementation Pattern:**
Each tool has a corresponding async function that calls `habiticaClient.get/post/put/delete()` and returns an MCP response with `content: [{ type: 'text', text: ... }]`.

**API Response Handling:**
- Success responses return formatted JSON or success messages
- Errors are caught and wrapped in `McpError` with `ErrorCode.InternalError`

## Environment Variables

Required:
- `HABITICA_USER_ID` - Habitica user ID from Settings > API
- `HABITICA_API_TOKEN` - Habitica API token from Settings > API

Optional:
- `MCP_LANG` / `LANG` - Language setting (`en` or `zh-CN`)

## Adding New Tools

1. Add tool definition to the `tools` array in `index.js`
2. Add case to the switch statement in `CallToolRequestSchema` handler
3. Create implementation function following existing patterns
4. Use `t()` for bilingual descriptions

## API Reference

The server wraps Habitica API v3: https://habitica.com/apidoc/

Common endpoints used:
- `/user` - User profile, stats, inventory
- `/tasks/user` - Task CRUD operations
- `/tasks/{taskId}/checklist` - Checklist management
- `/tags` - Tag operations
- `/user/feed/{pet}/{food}`, `/user/hatch/{egg}/{potion}` - Pet operations
- `/shops/{type}`, `/user/buy/{key}` - Shop operations
