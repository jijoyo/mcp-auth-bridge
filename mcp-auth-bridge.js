#!/usr/bin/env node
/**
 * mcp-auth-bridge.js — OAuth 2.1 + PKCE proxy para MCP Streamable HTTP
 *
 * Conecta MCP servers con OAuth 2.1 + PKCE a OpenCode (y otros agentes).
 * 
 * Uso:
 *   1. Configurar MCP_SERVER_URL arriba
 *   2. node mcp-auth-bridge.js
 *   3. Abrir http://localhost:18932/auth → Allow
 *   4. Configurar OpenCode: mcp.servers.x = "http://127.0.0.1:18932/mcp"
 *
 * Compatible con: Agensi, GitHub MCP, GitLab MCP, y cualquier OAuth-MCP-server
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// ─── CONFIG (cambiar aquí) ───────────────────────────────────────

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.agensi.io/mcp/auth';
const PORT = parseInt(process.env.BRIDGE_PORT || '18932', 10);

// OAuth endpoints (auto-discovery si no se especifican)
const OAUTH_BASE = 'https://mcp.agensi.io'; // cambiar según el server
const OAUTH_AUTH = `${OAUTH_BASE}/oauth/authorize`;
const OAUTH_TOKEN = `${OAUTH_BASE}/oauth/token`;
const OAUTH_REGISTER = `${OAUTH_BASE}/oauth/register`;

// ─── Paths ────────────────────────────────────────────────────────

const HOME = process.env.HOME || '/root';
const CLIENT_FILE = path.join(HOME, '.mcp-bridge-client.json');
const TOKENS_FILE = path.join(HOME, '.mcp-bridge-tokens.json');
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

// ─── Helpers ──────────────────────────────────────────────────────

function loadFile(file) {
  try { const raw = fs.readFileSync(file, 'utf8'); return JSON.parse(raw); }
  catch { return null; }
}

function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// PKCE
function genVerifier() { return crypto.randomBytes(32).toString('base64url'); }

async function genChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

// ─── OAuth ────────────────────────────────────────────────────────

async function getOrCreateClient() {
  const existing = loadFile(CLIENT_FILE);
  if (existing?.client_id) return existing;
  
  const resp = await fetch(OAUTH_REGISTER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read install', // ajustar según el server
      code_challenge_methods: ['S256'],
      client_name: 'MCP Auth Bridge',
      client_uri: `http://localhost:${PORT}`,
    }),
  });
  
  if (!resp.ok) throw new Error(`Register failed: ${resp.status}`);
  const client = await resp.json();
  saveFile(CLIENT_FILE, client);
  return client;
}

async function exchangeAuthCode(code, verifier) {
  const client = loadFile(CLIENT_FILE);
  
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URI,
    client_id: client.client_id,
    code_verifier: verifier,
  }).toString();
  
  const resp = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body,
  });
  
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Exchange failed: ${resp.status} ${err}`);
  }
  
  const tokens = await resp.json();
  if (tokens.expires_in) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  saveFile(TOKENS_FILE, tokens);
  return tokens;
}

async function refreshToken() {
  const current = loadFile(TOKENS_FILE);
  if (!current?.refresh_token) throw new Error('No refresh token');
  
  const client = loadFile(CLIENT_FILE);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
    client_id: client.client_id,
  }).toString();
  
  const resp = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body,
  });
  
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  
  const newTokens = await resp.json();
  if (newTokens.expires_in) {
    newTokens.expires_at = Math.floor(Date.now() / 1000) + newTokens.expires_in;
  }
  saveFile(TOKENS_FILE, newTokens);
  return newTokens;
}

// ─── Server ───────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;
  
  // ── Auth ──
  if (pathname === '/auth') {
    try {
      const client = await getOrCreateClient();
      const verifier = genVerifier();
      const challenge = await genChallenge(verifier);
      
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        scope: 'read install',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: verifier, // short state param (43 chars)
      });
      
      res.writeHead(302, { 'Location': `${OAUTH_AUTH}?${params.toString()}` });
      res.end();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><p>${err.message}</p><a href="/auth">Retry</a>`);
    }
    return;
  }
  
  // ── Callback ──
  if (pathname === '/auth/callback') {
    const code = query.code;
    const state = query.state;
    
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Missing code</h1><a href="/auth">Retry</a>');
      return;
    }
    
    try {
      await exchangeAuthCode(code, state);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>✅ Connected</title></head><body><h1>✅ Connected</h1><p>MCP proxy signed in.</p></body></html>');
    } catch (err) {
      console.error('[Callback] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><p>${err.message}</p><a href="/auth">Retry</a>`);
    }
    return;
  }
  
  // ── Status ──
  if (pathname === '/status') {
    const tokens = loadFile(TOKENS_FILE);
    const client = loadFile(CLIENT_FILE);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      client_registered: !!client?.client_id,
      tokens_valid: !!tokens?.access_token,
      expires_at: tokens?.expires_at ? new Date(tokens.expires_at*1000).toISOString() : 'none',
      mcp: `http://localhost:${PORT}/mcp`,
      mcp_server: MCP_SERVER_URL,
    }));
    return;
  }
  
  // ── Reauth ──
  if (pathname === '/reauth') {
    try { fs.unlinkSync(TOKENS_FILE); } catch {}
    res.writeHead(302, { 'Location': '/auth' });
    res.end();
    return;
  }
  
  // ── MCP Forward ──
  if (pathname === '/mcp') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const tokens = loadFile(TOKENS_FILE);
        let accessToken = tokens?.access_token;
        
        if (tokens?.expires_at && Date.now() > (tokens.expires_at*1000 - 60000) && tokens?.refresh_token) {
          try {
            await refreshToken();
            accessToken = loadFile(TOKENS_FILE)?.access_token;
          } catch {}
        }
        
        if (!accessToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc:'2.0', error:{code:-32001,message:'Not signed in. Visit /auth'}, id:null }));
          return;
        }
        
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        };
        const sid = req.headers['mcp-session-id'];
        if (sid) headers['MCP-Session-Id'] = sid;
        
        const resp = await fetch(MCP_SERVER_URL, {
          method: req.method, headers, body: body || undefined,
        });
        
        const rHeaders = { 'Content-Type': resp.headers.get('content-type') || 'application/json' };
        const mcpSid = resp.headers.get('MCP-Session-Id');
        if (mcpSid) rHeaders['MCP-Session-Id'] = mcpSid;
        
        const rBody = await resp.text();
        res.writeHead(resp.status, rHeaders);
        res.end(rBody);
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc:'2.0', error:{code:-32603,message:`Proxy: ${err.message}`}, id:null }));
      }
    });
    return;
  }
  
  // ── Default ──
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html><head><title>MCP Auth Bridge</title>
    <style>body{font-family:system-ui;padding:40px;max-width:500px}
    a{display:inline-block;padding:8px 16px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;margin:4px}</style>
    </head><body>
    <h1>🔗 MCP Auth Bridge</h1>
    <p>OAuth 2.1 + PKCE proxy → ${MCP_SERVER_URL}</p>
    <a href="/auth">Sign in</a>
    <a href="/status">Status</a>
    </body></html>
  `);
});

server.listen(PORT, () => {
  console.log(`\n🔗 MCP Auth Bridge on port ${PORT}`);
  console.log(`📡 MCP: http://localhost:${PORT}/mcp`);
  console.log(`🔑 Auth: http://localhost:${PORT}/auth`);
  console.log(`🎯 Target: ${MCP_SERVER_URL}`);
  
  const tokens = loadFile(TOKENS_FILE);
  if (!tokens?.access_token) {
    console.log(`\n👉 Visit http://localhost:${PORT}/auth`);
  } else {
    console.log(`✅ Signed in.`);
  }
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
