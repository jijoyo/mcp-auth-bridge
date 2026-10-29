# MCP Auth Bridge

Conecta MCP servers con OAuth 2.1 + PKCE a OpenCode.

## Problema

OpenCode V2 no soporta OAuth 2.1 con PKCE (dynamic client registration + authorization code flow + token exchange). Los MCPs modernos como Agensi, GitHub, GitLab usan este flow y quedan desconectados.

## Solución

Proxy Node.js que maneja todo el flow OAuth y expone un endpoint MCP Streamable HTTP que OpenCode sí conecta.

## Quick Start

```bash
# 1. Descargar
curl -L -o ~/.local/bin/mcp-auth-bridge.js \
  https://raw.githubusercontent.com/jijoyo/mcp-auth-bridge/main/mcp-auth-bridge.js

# 2. Editar MCP_SERVER_URL al inicio del archivo

# 3. Arrancar
nohup node ~/.local/bin/mcp-auth-bridge.js > /tmp/mcp-bridge.log 2>&1 &

# 4. Sign-in: abrir http://localhost:18932/auth → Allow

# 5. OpenCode config: mcp.servers.x = "http://127.0.0.1:18932/mcp"
```

## Testing

Para verificar: `curl http://localhost:18932/status`

```json
{
  "client_registered": true,
  "tokens_valid": true,
  "expires_at": "2026-10-29T20:00:00.000Z",
  "mcp": "http://localhost:18932/mcp",
  "mcp_server": "https://mcp.agensi.io/mcp/auth"
}
```

## ¿Por qué existe este tool?

OpenCode es el agente de código más popular en Linux, pero no soporta OAuth 2.1 + PKCE. Esto deja desconectados a todos los MCPs modernos.

MCP Auth Bridge es el puente.

## Contribuir

PRs welcome. El proxy es un solo archivo de ~300 líneas.
