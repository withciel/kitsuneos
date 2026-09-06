import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { KitsuneEngine } from '@kitsuneos/core';
import { handleStreamableMcpRequest } from '@kitsuneos/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  issueApiKey,
} from './fixtures.js';

describe('Streamable HTTP MCP', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;
  let apiKey: string;
  let baseUrl = '';
  let closeServer: () => Promise<void> = async () => {};

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
    const issued = await issueApiKey(engine, fixture.adminId);
    apiKey = issued.plaintext;

    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const host = req.headers.host ?? '127.0.0.1';
        const request = new Request(`http://${host}${req.url ?? '/'}`, {
          method: req.method,
          headers: req.headers as HeadersInit,
          body:
            req.method === 'POST' || req.method === 'PUT' ? body : undefined,
        });
        void handleStreamableMcpRequest(engine, request).then(
          async (response) => {
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            res.end(Buffer.from(await response.arrayBuffer()));
          },
        );
      });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
  });

  afterAll(async () => {
    await closeServer();
  });

  it('rejects missing auth with WWW-Authenticate and CORS', async () => {
    const metadataUrl =
      'https://app.example.test/.well-known/oauth-protected-resource/api/mcp';
    const origin = 'https://cursor.com';

    const serverWithMeta = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const host = req.headers.host ?? '127.0.0.1';
        const request = new Request(`http://${host}${req.url ?? '/'}`, {
          method: req.method,
          headers: req.headers as HeadersInit,
          body:
            req.method === 'POST' || req.method === 'PUT' ? body : undefined,
        });
        void handleStreamableMcpRequest(engine, request, {
          resourceMetadataUrl: metadataUrl,
        }).then(async (response) => {
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        });
      });
    });

    await new Promise<void>((resolve) =>
      serverWithMeta.listen(0, '127.0.0.1', resolve),
    );
    const address = serverWithMeta.address() as AddressInfo;
    const metaBase = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(metaBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '0.0.1' },
          },
        }),
      });
      expect(response.status).toBe(401);
      const www = response.headers.get('www-authenticate') ?? '';
      expect(www).toMatch(/Bearer/i);
      expect(www).toContain(`resource_metadata="${metadataUrl}"`);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(
        response.headers.get('access-control-expose-headers') ?? '',
      ).toMatch(/WWW-Authenticate/i);
    } finally {
      await new Promise<void>((resolve, reject) => {
        serverWithMeta.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('initialize + tools/list + tools/call with API key', async () => {
    async function rpc(
      id: number,
      method: string,
      params?: Record<string, unknown>,
    ) {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
      const body = (await response.json()) as {
        result?: { tools?: Array<{ name: string }> };
        error?: unknown;
      };
      expect(response.status).toBe(200);
      expect(body.error).toBeUndefined();
      return body.result;
    }

    const init = await rpc(1, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'acceptance', version: '0.0.1' },
    });
    expect(init).toBeTruthy();

    const listed = await rpc(2, 'tools/list');
    const names = (listed?.tools ?? []).map((tool) => tool.name);
    expect(names).toContain('describe_schema');

    const called = await rpc(3, 'tools/call', {
      name: 'describe_schema',
      arguments: {},
    });
    expect(called).toBeTruthy();
  });
});
