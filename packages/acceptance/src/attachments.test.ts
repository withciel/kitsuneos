import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_CONFIG,
  type KitsuneEngine,
  LocalFilesystemBlobStore,
  migrate,
  sha256Hex,
} from '@kitsuneos/core';
import { createMcpHandlers } from '@kitsuneos/mcp';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStandardFixture, type Fixture, getEngine } from './fixtures.js';

describe('attachments (R13 grant-aware)', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    await migrate(DEFAULT_CONFIG);
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('stores blobs outside Postgres and enforces field grants on list/get', async () => {
    const docsId = await engine.defineCollection(fixture.workspaceId, {
      name: 'docs',
      fields: [
        { name: 'title', type: 'text', nullable: false },
        { name: 'body', type: 'prose' },
        { name: 'secret_note', type: 'prose' },
      ],
    });
    await engine.createGrant(
      fixture.workspaceId,
      fixture.adminId,
      docsId,
      'admin',
      null,
      null,
      { actorId: fixture.adminId },
    );
    await engine.createGrant(
      fixture.workspaceId,
      fixture.readerId,
      docsId,
      'read',
      ['title', 'body'],
      null,
      { actorId: fixture.adminId },
    );

    const recordId = await engine.directWrite(
      fixture.workspaceId,
      fixture.adminId,
      'docs',
      {
        title: 'Spec',
        body: 'Public body',
        secret_note: 'classified',
      },
    );

    const publicBytes = Buffer.from('hello-public-pdf');
    const secretBytes = Buffer.from('top-secret-bytes');
    const publicMeta = await engine.putAttachment(
      fixture.workspaceId,
      fixture.adminId,
      {
        collection: 'docs',
        recordId,
        fieldName: 'body',
        contentType: 'application/pdf',
        contentBase64: publicBytes.toString('base64'),
        fileName: 'public.pdf',
      },
    );
    expect(publicMeta.contentHash).toBe(sha256Hex(publicBytes));
    expect(publicMeta.byteSize).toBe(publicBytes.length);

    const secretMeta = await engine.putAttachment(
      fixture.workspaceId,
      fixture.adminId,
      {
        collection: 'docs',
        recordId,
        fieldName: 'secret_note',
        contentType: 'text/plain',
        contentBase64: secretBytes.toString('base64'),
        fileName: 'secret.txt',
      },
    );

    const adminList = await engine.listAttachments(
      fixture.workspaceId,
      fixture.adminId,
      { collection: 'docs', recordId },
    );
    expect(adminList.map((a) => a.fieldName).sort()).toEqual([
      'body',
      'secret_note',
    ]);

    const readerList = await engine.listAttachments(
      fixture.workspaceId,
      fixture.readerId,
      { collection: 'docs', recordId },
    );
    expect(readerList.map((a) => a.fieldName)).toEqual(['body']);
    expect(readerList.some((a) => a.fieldName === 'secret_note')).toBe(false);

    const readerPublic = await engine.getAttachment(
      fixture.workspaceId,
      fixture.readerId,
      publicMeta.id,
    );
    expect(readerPublic?.contentBase64).toBe(publicBytes.toString('base64'));

    const readerSecret = await engine.getAttachment(
      fixture.workspaceId,
      fixture.readerId,
      secretMeta.id,
    );
    expect(readerSecret).toBeNull();

    expect(await engine.blobStore.exists(publicMeta.contentHash)).toBe(true);
  });

  it('denies put when collection grant is missing; revoke hides downloads', async () => {
    const fresh = await createStandardFixture(engine);
    const colId = await engine.defineCollection(fresh.workspaceId, {
      name: 'files',
      fields: [
        { name: 'title', type: 'text', nullable: false },
        { name: 'body', type: 'prose' },
      ],
    });
    await engine.createGrant(
      fresh.workspaceId,
      fresh.adminId,
      colId,
      'admin',
      null,
      null,
      { actorId: fresh.adminId },
    );
    const grantId = await engine.createGrant(
      fresh.workspaceId,
      fresh.readerId,
      colId,
      'read',
      ['title', 'body'],
      null,
      { actorId: fresh.adminId },
    );

    const recordId = await engine.directWrite(
      fresh.workspaceId,
      fresh.adminId,
      'files',
      { title: 'A', body: 'B' },
    );

    const meta = await engine.putAttachment(fresh.workspaceId, fresh.adminId, {
      collection: 'files',
      recordId,
      fieldName: 'body',
      contentType: 'text/plain',
      contentBase64: Buffer.from('x').toString('base64'),
    });

    await expect(
      engine.putAttachment(fresh.workspaceId, fresh.agentId, {
        collection: 'files',
        recordId,
        fieldName: 'body',
        contentType: 'text/plain',
        contentBase64: Buffer.from('y').toString('base64'),
      }),
    ).rejects.toThrow();

    const before = await engine.getAttachment(
      fresh.workspaceId,
      fresh.readerId,
      meta.id,
    );
    expect(before).not.toBeNull();

    await engine.revokeGrant(grantId, fresh.adminId, fresh.workspaceId);

    const after = await engine.getAttachment(
      fresh.workspaceId,
      fresh.readerId,
      meta.id,
    );
    expect(after).toBeNull();
    expect(
      await engine.listAttachments(fresh.workspaceId, fresh.readerId, {
        collection: 'files',
        recordId,
      }),
    ).toEqual([]);
  });

  it('MCP put/list/get_attachment tools honor grants', async () => {
    const fresh = await createStandardFixture(engine);
    const colId = await engine.defineCollection(fresh.workspaceId, {
      name: 'media',
      fields: [
        { name: 'title', type: 'text', nullable: false },
        { name: 'body', type: 'prose' },
      ],
    });
    await engine.createGrant(
      fresh.workspaceId,
      fresh.adminId,
      colId,
      'admin',
      null,
      null,
      { actorId: fresh.adminId },
    );
    await engine.createGrant(
      fresh.workspaceId,
      fresh.limitedAgentId,
      colId,
      'read',
      ['title'],
      null,
      { actorId: fresh.adminId },
    );

    const admin = createMcpHandlers(engine, () => ({
      workspaceId: fresh.workspaceId,
      principalId: fresh.adminId,
    }));
    const limited = createMcpHandlers(engine, () => ({
      workspaceId: fresh.workspaceId,
      principalId: fresh.limitedAgentId,
    }));

    const recordId = await engine.directWrite(
      fresh.workspaceId,
      fresh.adminId,
      'media',
      { title: 'T', body: 'B' },
    );
    const put = await admin.put_attachment({
      collection: 'media',
      recordId,
      fieldName: 'body',
      contentType: 'image/png',
      contentBase64: Buffer.from([137, 80, 78, 71]).toString('base64'),
      fileName: 'x.png',
    });

    const listed = await limited.list_attachments({
      collection: 'media',
      recordId,
    });
    expect(listed).toEqual([]);

    const got = await limited.get_attachment({ attachmentId: put.id });
    expect(got).toBeNull();

    const adminGot = await admin.get_attachment({ attachmentId: put.id });
    expect(adminGot?.meta.fileName).toBe('x.png');
  });

  it('LocalFilesystemBlobStore is content-addressed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kitsune-blob-unit-'));
    const store = new LocalFilesystemBlobStore(root);
    const bytes = Buffer.from('same-bytes');
    const hash = sha256Hex(bytes);
    await store.put(hash, bytes);
    await store.put(hash, bytes);
    expect(await store.exists(hash)).toBe(true);
    expect(await store.get(hash)).toEqual(bytes);
  });
});
