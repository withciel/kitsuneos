import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { buildZip, readZip, VAULT_ZIP_LIMITS } from './vault-zip.ts';

describe('vault zip', () => {
  it('round-trips entries built by buildZip', () => {
    const entries = [
      { name: 'a.md', data: Buffer.from('---\nid: 1\n---\n\nBody A', 'utf8') },
      { name: 'nested/b.md', data: Buffer.from('Body B', 'utf8') },
    ];
    const zip = buildZip(entries);
    const back = readZip(zip);
    assert.equal(back.length, 2);
    assert.deepEqual(
      back.map((e) => ({ name: e.name, data: e.data.toString('utf8') })),
      [
        { name: 'a.md', data: '---\nid: 1\n---\n\nBody A' },
        { name: 'nested/b.md', data: 'Body B' },
      ],
    );
  });

  it('produces a valid empty archive for zero entries', () => {
    const zip = buildZip([]);
    const back = readZip(zip);
    assert.deepEqual(back, []);
  });

  it('throws a clear error for non-zip input', () => {
    assert.throws(() => readZip(Buffer.from('not a zip', 'utf8')));
  });

  it('rejects archives with too many entries', () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({
      name: `${i}.md`,
      data: Buffer.from(`note ${i}`, 'utf8'),
    }));
    const zip = buildZip(entries);
    assert.throws(() => readZip(zip, { maxEntries: 2 }), /too many entries/);
  });

  it('rejects archives that inflate past the byte budget', () => {
    const entries = [
      { name: 'big.md', data: Buffer.alloc(200, 0x61) },
      { name: 'more.md', data: Buffer.alloc(200, 0x62) },
    ];
    const zip = buildZip(entries);
    assert.throws(
      () => readZip(zip, { maxInflatedBytes: 250 }),
      /maximum inflated size/,
    );
  });

  it('rejects DEFLATE entries that expand past maxOutputLength', () => {
    // Highly compressible payload that would expand well past a tiny budget.
    const payload = Buffer.alloc(50_000, 0);
    const compressed = deflateRawSync(payload);
    assert.ok(compressed.length < 200);

    // Hand-build a minimal single-entry DEFLATE zip (local + central + EOCD).
    const name = Buffer.from('bomb.md', 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // DEFLATE
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(0, 22); // lie about uncompressed size
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(0, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42); // local header at offset 0

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(46 + name.length, 12);
    eocd.writeUInt32LE(30 + name.length + compressed.length, 16);

    const zip = Buffer.concat([local, name, compressed, central, name, eocd]);

    assert.throws(
      () => readZip(zip, { maxInflatedBytes: 1024 }),
      /maximum inflated size/,
    );
  });

  it('exposes browser MVP upload defaults', () => {
    assert.equal(VAULT_ZIP_LIMITS.maxUploadBytes, 8 * 1024 * 1024);
    assert.equal(VAULT_ZIP_LIMITS.maxEntries, 500);
    assert.equal(VAULT_ZIP_LIMITS.maxInflatedBytes, 32 * 1024 * 1024);
  });
});
