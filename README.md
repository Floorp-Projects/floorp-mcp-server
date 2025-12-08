# Floorp MCP Server

This is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server bridge for the Floorp browser.

It allows AI assistants to interact with Floorp to:

- List and create tabs
- Get browser history and downloads
- Get page content (HTML/Text)
- Perform automation (Click, Navigate, Fill Forms)

## Requirement

- **Floorp** browser installed and running.
- In `about:config`, set `floorp.mcp.enabled` to `true`.

## Usage

### npx

```bash
npx -y floorp-mcp-server
```

### Configuration (Claude Desktop / generic)

Add to your MCP config:

```json
{
  "mcpServers": {
    "floorp": {
      "command": "npx",
      "args": ["-y", "floorp-mcp-server"]
    }
  }
}

```
