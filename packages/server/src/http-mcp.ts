import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import { TOOL_DEFINITIONS } from '@kitsuneos/mcp/schemas';
import { invokeMcpTool, isKitsuneError } from '@kitsuneos/mcp/invoke';
import { auditAuthFailure, resolveCredential } from './resolve-credential.js';
import { checkRateLimit } from './rate-limit.js';

export interface HttpMcpServerOptions {
  port?: number;
  host?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function createHttpMcpServer(
  engine: KitsuneEngine,
  options: HttpMcpServerOptions = {},
) {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && req.url === '/mcp/tools') {
        const auth = req.headers.authorization;
        try {
          const credential = await resolveCredential(engine, auth);
          if (!checkRateLimit(credential.keyId)) {
            sendJson(res, 429, { error: 'rate_limited', message: 'Too many requests' });
            return;
          }
        } catch (error) {
          await auditAuthFailure(
            engine,
            auth,
            error instanceof KitsuneError ? error.message : 'auth failed',
          );
          sendJson(res, 401, { error: 'forbidden', message: 'Invalid API key' });
          return;
        }
        sendJson(res, 200, { tools: TOOL_DEFINITIONS });
        return;
      }

      if (req.method === 'POST' && req.url === '/mcp/tools/call') {
        const auth = req.headers.authorization;
        let credential;
        try {
          credential = await resolveCredential(engine, auth);
        } catch (error) {
          await auditAuthFailure(
            engine,
            auth,
            error instanceof KitsuneError ? error.message : 'auth failed',
          );
          sendJson(res, 401, { error: 'forbidden', message: 'Invalid API key' });
          return;
        }

        if (!checkRateLimit(credential.keyId)) {
          sendJson(res, 429, { error: 'rate_limited', message: 'Too many requests' });
          return;
        }

        const raw = await readBody(req);
        const payload = JSON.parse(raw) as { tool: string; arguments?: Record<string, unknown> };
        if (!payload.tool) {
          sendJson(res, 400, { error: 'validation', message: 'tool is required' });
          return;
        }

        if (
          'workspaceId' in (payload.arguments ?? {}) ||
          'workspace_id' in (payload.arguments ?? {}) ||
          'workspace' in (payload.arguments ?? {})
        ) {
          sendJson(res, 400, {
            error: 'validation',
            message: 'workspace parameters are not permitted',
          });
          return;
        }

        try {
          const result = await invokeMcpTool(
            engine,
            {
              workspaceId: credential.workspaceId,
              principalId: credential.principalId,
            },
            payload.tool,
            payload.arguments ?? {},
          );
          sendJson(res, 200, { result });
        } catch (error) {
          if (isKitsuneError(error)) {
            sendJson(res, 400, {
              error: error.code,
              message: error.message,
              ...error.details,
            });
            return;
          }
          throw error;
        }
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      sendJson(res, 500, {
        error: 'internal',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    server,
    listen: () =>
      new Promise<{ port: number; url: string }>((resolve, reject) => {
        server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
          const address = server.address();
          if (!address || typeof address === 'string') {
            reject(new Error('Failed to bind HTTP MCP server'));
            return;
          }
          const url = `http://${options.host ?? '127.0.0.1'}:${address.port}`;
          resolve({ port: address.port, url });
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
