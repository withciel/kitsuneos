import type { JsonValue } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { pageHref } from '@/lib/page';
import { resolveRequestAuth } from '@/lib/request-auth';

export interface SearchResultItem {
  collection: string;
  recordId: string;
  label: string;
  excerpt: string;
  href: string;
  score: number;
}

function asSearchText(value: JsonValue | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function scoreMatch(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  const idx = h.indexOf(n);
  if (idx >= 0) return Math.max(10, 60 - idx);
  return 0;
}

/**
 * Grant-aware + page-ACL keyword search across visible collections.
 * Uses engine.query (post-filters via canViewPage) rather than semantic
 * embeddings so ⌘K works without indexed prose vectors.
 *
 * TODO(compiler-acl): fold page_access into compiled row predicates so
 * list/search never materialize private rows before filtering.
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const limitParam = Number(url.searchParams.get('limit') ?? '20');
    const limit = Math.min(
      50,
      Math.max(1, Number.isFinite(limitParam) ? limitParam : 20),
    );

    if (!q) {
      return NextResponse.json({ results: [] as SearchResultItem[] });
    }

    const schema = await engine.describeSchema(
      ctx.workspaceId,
      ctx.principalId,
    );
    const results: SearchResultItem[] = [];

    for (const collection of schema.collections ?? []) {
      const fieldNames = collection.fields
        .map((field) => field.name)
        .filter((name) => name !== 'id');
      if (fieldNames.length === 0) continue;

      const rows = await engine.query(ctx.workspaceId, ctx.principalId, {
        collection: collection.name,
        fields: fieldNames,
        limit: 80,
      });

      for (const row of rows) {
        if (typeof row.id !== 'string') continue;
        let best = 0;
        let excerpt = '';
        const label =
          asSearchText(row.title) ||
          asSearchText(row.name) ||
          asSearchText(row.email) ||
          row.id.slice(0, 8);

        for (const field of fieldNames) {
          const text = asSearchText(row[field]);
          if (!text) continue;
          const score = scoreMatch(text, q);
          if (score > best) {
            best = score;
            excerpt = text.length > 160 ? `${text.slice(0, 159)}…` : text;
          }
        }

        // Also match concatenated blob for multi-token queries.
        if (best === 0) {
          const blob = fieldNames
            .map((field) => asSearchText(row[field]))
            .filter(Boolean)
            .join(' ');
          best = scoreMatch(blob, q);
          if (best > 0) {
            excerpt = blob.length > 160 ? `${blob.slice(0, 159)}…` : blob;
          }
        }

        if (best > 0) {
          results.push({
            collection: collection.name,
            recordId: row.id,
            label,
            excerpt,
            href: pageHref(row.id, collection.name),
            score: best,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return NextResponse.json({ results: results.slice(0, limit) });
  } catch (error) {
    return jsonError(error);
  }
}
