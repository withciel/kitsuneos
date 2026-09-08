/**
 * Minimal markdown + frontmatter helpers for the vault import/export MVP.
 *
 * Deliberately duplicated (not imported) from
 * `packages/cli/src/ingest-parse.ts`'s `parseFrontmatter`: that helper is an
 * internal module of `@kitsuneos/cli` and is not part of the package's
 * public `exports` map, so re-exporting it would require a package refactor
 * out of scope for this MVP. Keep this in sync by hand if the CLI parser
 * changes shape.
 */

export interface ParsedVaultMarkdown {
  id?: string;
  title: string;
  body: string;
}

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*\//, '').replace(/\.md$/i, '');
  const title = base.replace(/[-_]+/g, ' ').trim();
  return title || 'Untitled';
}

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  if (!raw.startsWith('---\n')) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) {
    return { meta: {}, body: raw };
  }
  const block = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) meta[key] = value;
  }
  return { meta, body };
}

/** Parse one vault markdown file's frontmatter + body. */
export function parseVaultMarkdown(
  raw: string,
  fileName: string,
): ParsedVaultMarkdown {
  const { meta, body } = parseFrontmatter(raw);
  return {
    id: meta.id || undefined,
    title: meta.title || titleFromFileName(fileName),
    body: body.trim(),
  };
}

/** Render a record as vault markdown with `id`/`title` frontmatter. */
export function serializeVaultMarkdown(input: {
  id: string;
  title: string;
  body: string;
}): string {
  const safeTitle = input.title.replaceAll('"', "'");
  return [
    '---',
    `id: ${input.id}`,
    `title: "${safeTitle}"`,
    '---',
    '',
    input.body,
    '',
  ].join('\n');
}

/** Filesystem-safe file name for an exported record. */
export function vaultFileName(title: string, id: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug ? `${slug}-` : ''}${id.slice(0, 8)}.md`;
}
