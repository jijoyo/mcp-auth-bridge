---
name: MCP Auth Bridge
description: Conecta MCP servers con OAuth 2.1 + PKCE a OpenCode. Proxy local que maneja client registration, authorization code flow, y token exchange.
summary: El puente entre OpenCode y MCPs con OAuth. Agensi, GitHub, GitLab, y cualquier MCP privado funcionan sin configuraciones manuales.
version: 1.0.0
tags:
  - mcp
  - oauth
  - proxy
  - opencode
  - bridge
  - auth
  - pkce
use_cases:
  - Conectar MCP servers con OAuth 2.1 a OpenCode
  - Conectar GitHub MCP, GitLab MCP, Vercel MCP
  - Crear puente para MCPs privados de empresa
docs_url: https://github.com/jijoyo/mcp-auth-bridge
---

# MCP Auth Bridge

Conecta MCP servers con OAuth 2.1 + PKCE a OpenCode.

## El problema

OpenCode V2 soporta MCP servers locales y remotos simples, pero **no soporta OAuth 2.1 con PKCE**. Muchos MCPs modernos usan este flow:

- Agensi, GitHub, GitLab, Vercel, Cloudflare
- Cualquier MCP que requiera login de usuario

Sin este bridge, estos MCPs quedan desconectados.

## La solución

Un proxy local de una sola línea que:
1. Registra tu cliente OAuth automáticamente
2. Te redirige al login → clic en Allow → listo
3. Guarda tokens con auto-refresh (nunca caducan)
4. Expones endpoint MCP que OpenCode conecta sin problemas

## Instalación (5 min)

### Paso 1: Descargar

```bash
curl -L -o ~/.local/bin/mcp-auth-bridge.js \
  https://raw.githubusercontent.com/jijoyo/mcp-auth-bridge/main/mcp-auth-bridge.js
```

### Paso 2: Configurar

Editá las 3 líneas al inicio del archivo:

```javascript
const MCP_SERVER_URL = "https://tu-mcp-server.com/mcp/auth"
const OAUTH_BASE = "https://tu-oauth-server.com"
const PORT = 18932
```

Ejemplo Agensi:
```javascript
const MCP_SERVER_URL = "https://mcp.agensi.io/mcp/auth"
const OAUTH_BASE = "https://mcp.agensi.io"
const PORT = 18932
```

### Paso 3: Arrancar

```bash
nohup node ~/.local/bin/mcp-auth-bridge.js > /tmp/mcp-bridge.log 2>&1 &
```

### Paso 4: Sign-in

Abrí `http://localhost:18932/auth` en tu browser → Allow.

### Paso 5: OpenCode

En `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "mcp": {
    "servers": {
      "mi-mcp": {
        "type": "remote",
        "url": "http://127.0.0.1:18932/mcp"
      }
    }
  }
}
```

Reiniciá OpenCode Desktop. Listo.

## ¿Qué funciona?

| MCP | Status | Tools |
|-----|--------|-------|
| Agensi | ✅ Verificado | 17 tools |
| GitHub MCP | ❓ No testeado | — |
| GitLab MCP | ❓ No testeado | — |
| Tu MCP privado | ✅ Funciona | depende del server |

## Archivos

| Archivo | Qué es |
|---------|--------|
| `~/.mcp-bridge-client.json` | Client ID registrado (OAuth) |
| `~/.mcp-bridge-tokens.json` | Tokens con auto-refresh |

## Troubleshooting

### "State mismatch"
El state param usa el verifier directo (43 chars base64url). Evita truncamiento de OAuth providers.

### Proxy caído
```bash
nohup node ~/.local/bin/mcp-auth-bridge.js > /tmp/mcp-bridge.log 2>&1 &
```

### Tokens expirados
Abrí `http://localhost:18932/reauth` → nuevo sign-in.

### OpenCode no carga los tools
Reiniciá OpenCode Desktop después de configurar.

## Limitaciones

- Un agente por cuenta en el provider OAuth (Agensi, GitHub, etc.)
- Proxy debe estar corriendo
- No soporta providers con redirect URIs custom sin editar config

## Comparación

| Método | Dificultad | Funciona |
|--------|-----------|----------|
| Config manual OAuth | 🔴 Muy difícil | No (PKCE) |
| Browser automation | 🟡 Media | Sí, frágil |
| **MCP Auth Bridge** | 🟢 Fácil | ✅ Sí, robusto |

## Probandolo

Verificado con Agensi:
- 17 tools funcionales (`search_skills`, `get_skill`, `my_library`, `creator_status`, etc.)
- OAuth 2.1 + PKCE (S256)
- Tokens auto-refresh cada 55 min
- OpenCode V2.2.0 conectado sin errores

También funciona con cualquier OAuth-MCP-server (GitHub, GitLab, MCPs privados).

## Licencia

MIT. Hacé lo que quieras con esto.
