import type { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  CollectionView,
  CollectionViewConfig,
  CollectionViewType,
} from '../types.js';
import { KitsuneError } from '../types.js';
import { queryOne, queryRows } from '../db/pool.js';

function parseConfig(raw: unknown): CollectionViewConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as CollectionViewConfig;
}

function mapView(row: {
  id: string;
  collection_id: string;
  name: string;
  type: string;
  config: unknown;
  position: number;
  is_default_table: boolean;
}): CollectionView {
  return {
    id: row.id,
    collectionId: row.collection_id,
    name: row.name,
    type: row.type as CollectionViewType,
    config: parseConfig(row.config),
    position: row.position,
    isDefaultTable: row.is_default_table,
  };
}

export async function ensureDefaultTableView(
  client: PoolClient,
  collectionId: string,
): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    client,
    `SELECT id FROM kitsune.collection_views
      WHERE collection_id = $1 AND is_default_table = true
      LIMIT 1`,
    [collectionId],
  );
  if (existing) return existing.id;

  const id = uuidv4();
  await client.query(
    `INSERT INTO kitsune.collection_views
       (id, collection_id, name, type, config, position, is_default_table)
     VALUES ($1, $2, 'Table', 'table', '{}'::jsonb, 0, true)`,
    [id, collectionId],
  );
  return id;
}

export async function listCollectionViews(
  client: PoolClient,
  collectionId: string,
): Promise<CollectionView[]> {
  await ensureDefaultTableView(client, collectionId);
  const rows = await queryRows<{
    id: string;
    collection_id: string;
    name: string;
    type: string;
    config: unknown;
    position: number;
    is_default_table: boolean;
  }>(
    client,
    `SELECT id, collection_id, name, type, config, position, is_default_table
       FROM kitsune.collection_views
      WHERE collection_id = $1
      ORDER BY position ASC, created_at ASC`,
    [collectionId],
  );
  return rows.map(mapView);
}

export async function createCollectionView(
  client: PoolClient,
  collectionId: string,
  input: {
    name: string;
    type: CollectionViewType;
    config?: CollectionViewConfig;
  },
): Promise<CollectionView> {
  if (input.type === 'table') {
    // Extra table views are allowed but never as the undeletable default.
  }
  const maxPos = await queryOne<{ m: number | null }>(
    client,
    `SELECT max(position) AS m FROM kitsune.collection_views WHERE collection_id = $1`,
    [collectionId],
  );
  const id = uuidv4();
  const position = (maxPos?.m ?? -1) + 1;
  await client.query(
    `INSERT INTO kitsune.collection_views
       (id, collection_id, name, type, config, position, is_default_table)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, false)`,
    [
      id,
      collectionId,
      input.name.trim() || input.type,
      input.type,
      JSON.stringify(input.config ?? {}),
      position,
    ],
  );
  const row = await queryOne<{
    id: string;
    collection_id: string;
    name: string;
    type: string;
    config: unknown;
    position: number;
    is_default_table: boolean;
  }>(
    client,
    `SELECT id, collection_id, name, type, config, position, is_default_table
       FROM kitsune.collection_views WHERE id = $1`,
    [id],
  );
  if (!row) throw new KitsuneError('Failed to create view', 'internal');
  return mapView(row);
}

export async function updateCollectionView(
  client: PoolClient,
  viewId: string,
  input: {
    name?: string;
    config?: CollectionViewConfig;
    position?: number;
  },
): Promise<CollectionView> {
  const existing = await queryOne<{
    id: string;
    collection_id: string;
    name: string;
    type: string;
    config: unknown;
    position: number;
    is_default_table: boolean;
  }>(
    client,
    `SELECT id, collection_id, name, type, config, position, is_default_table
       FROM kitsune.collection_views WHERE id = $1`,
    [viewId],
  );
  if (!existing) throw new KitsuneError('View not found', 'not_found');

  const name = input.name?.trim() || existing.name;
  const config =
    input.config !== undefined
      ? input.config
      : parseConfig(existing.config);
  const position = input.position ?? existing.position;

  await client.query(
    `UPDATE kitsune.collection_views
        SET name = $2, config = $3::jsonb, position = $4
      WHERE id = $1`,
    [viewId, name, JSON.stringify(config), position],
  );

  return mapView({
    ...existing,
    name,
    config,
    position,
  });
}

export async function deleteCollectionView(
  client: PoolClient,
  viewId: string,
): Promise<void> {
  const existing = await queryOne<{ is_default_table: boolean }>(
    client,
    `SELECT is_default_table FROM kitsune.collection_views WHERE id = $1`,
    [viewId],
  );
  if (!existing) throw new KitsuneError('View not found', 'not_found');
  if (existing.is_default_table) {
    throw new KitsuneError('Cannot delete the default Table view', 'validation');
  }
  await client.query(`DELETE FROM kitsune.collection_views WHERE id = $1`, [
    viewId,
  ]);
}
