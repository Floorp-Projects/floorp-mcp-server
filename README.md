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

### Authentication

Floorp's OS-Server (port 58261 by default) requires a bearer token. Floorp
writes it to `~/.floorp/os-server-token` when the server starts, and this
bridge reads that file on every request, so it keeps working when Floorp is
started after the bridge or the token changes.

| Variable | Meaning |
| --- | --- |
| `FLOORP_OS_TOKEN` | Use this token instead of the token file. |
| `FLOORP_OS_PORT` | Connect to another port, for example when `floorp.os.server.port` was changed in `about:config`. |

A `401` error means the token did not match the running Floorp: check that the
token file exists and belongs to the Floorp instance you are connecting to.

On Windows, port 58261 can fall inside a TCP port range reserved by the system
(check with `netsh interface ipv4 show excludedportrange protocol=tcp`). Floorp
then cannot open the server; set `floorp.os.server.port` to a free port and the
same port in `FLOORP_OS_PORT`.
