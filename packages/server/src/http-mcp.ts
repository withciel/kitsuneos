import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import {
  handleGraphqlHttp,
  handleRestRecordGet,
  httpAuthError,
} from '@kitsuneos/graphql';
import { handleMcpHttpRequest } from './mcp-handlers.js';
import { resolveCredential } from './resolve-credential.js';

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
      const url = new URL(req.url ?? '/', 'http://localhost');
      const raw = req.method === 'POST' ? await readBody(req) : '';
      const method = req.method ?? 'GET';
      const auth = req.headers.authorization;

      if (
        method === 'POST' &&
        (url.pathname === '/graphql' || url.pathname === '/api/graphql')
      ) {
        try {
          const credential = await resolveCredential(engine, auth);
          const result = await handleGraphqlHttp(
            engine,
            {
              workspaceId: credential.workspaceId,
              principalId: credential.principalId,
            },
            raw,
            `http://localhost${url.pathname}`,
          );
          sendJson(res, result.status, result.body);
          return;
        } catch (error) {
          if (error instanceof KitsuneError && error.code === 'forbidden') {
            const failed = httpAuthError(error);
            sendJson(res, failed.status, failed.body);
            return;
          }
          throw error;
        }
      }

      const recordMatch = url.pathname.match(
        /^\/api\/records\/([^/]+)\/([^/]+)$/,
      );
      if (method === 'GET' && recordMatch?.[1] && recordMatch[2]) {
        try {
          const credential = await resolveCredential(engine, auth);
          const result = await handleRestRecordGet(
            engine,
            {
              workspaceId: credential.workspaceId,
              principalId: credential.principalId,
            },
            decodeURIComponent(recordMatch[1]),
            decodeURIComponent(recordMatch[2]),
          );
          sendJson(res, result.status, result.body);
          return;
        } catch (error) {
          if (error instanceof KitsuneError && error.code === 'forbidden') {
            const failed = httpAuthError(error);
            sendJson(res, failed.status, failed.body);
            return;
          }
          throw error;
        }
      }

      const result = await handleMcpHttpRequest(
        engine,
        method,
        url.pathname,
        auth,
        raw,
      );
      sendJson(res, result.status, result.body);
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

export type { McpHttpResult } from './mcp-handlers.js';
export { handleMcpHttpRequest } from './mcp-handlers.js';
