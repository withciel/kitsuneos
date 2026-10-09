import { engine } from '@/lib/engine';
import { recordLabel } from '@/lib/record-label';
import { isWorkspaceAdmin, requireWorkspace } from '@/lib/require-workspace';

export type ChangeSetSummaryData = {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  author: string;
  operations: Array<{ collection: string; recordId?: string | null }>;
};

export async function loadChangesLists(): Promise<{
  open: ChangeSetSummaryData[];
  closed: ChangeSetSummaryData[];
}> {
  const ctx = await requireWorkspace();
  const [open, closed] = await Promise.all([
    engine.listChangeSetSummaries(ctx.workspaceId, ctx.principalId, {
      scope: 'open',
    }),
    engine.listChangeSetSummaries(ctx.workspaceId, ctx.principalId, {
      scope: 'closed',
    }),
  ]);
  return {
    open: open as ChangeSetSummaryData[],
    closed: closed as ChangeSetSummaryData[],
  };
}

export type AgentRowData = {
  id: string;
  name: string;
  createdAt: string;
  activeKeyCount: number;
  membership: 'workspace' | 'team' | 'personal';
  teamId: string | null;
  ownerPrincipalId: string | null;
};

export async function loadAgentsPage(): Promise<{
  agents: AgentRowData[];
  teams: Array<{ principalId: string; label: string }>;
  myPrincipalId: string;
  isAdmin: boolean;
}> {
  const ctx = await requireWorkspace();
  const admin = isWorkspaceAdmin(ctx.role);
  const [agents, shareTargets] = await Promise.all([
    engine.listAgents(ctx.workspaceId),
    engine.listShareTargets(ctx.workspaceId, ctx.principalId, admin),
  ]);

  return {
    myPrincipalId: ctx.principalId,
    isAdmin: admin,
    teams: shareTargets.teams.map((row) => ({
      principalId: row.principalId,
      label: row.name,
    })),
    agents: agents
      .map((row) => ({
        id: row.id,
        name: row.displayName,
        createdAt: row.createdAt,
        activeKeyCount: row.keyCount,
        membership: (row.membership ??
          'workspace') as AgentRowData['membership'],
        teamId: row.teamPrincipalId,
        ownerPrincipalId: row.ownerPrincipalId,
      }))
      .filter(
        (agent) =>
          admin ||
          agent.membership !== 'personal' ||
          agent.ownerPrincipalId === ctx.principalId,
      ),
  };
}

export type GraphPageData = {
  nodes: Array<{ id: string; collection: string; label: string }>;
  edges: Array<{ from: string; to: string; field: string }>;
};

export async function loadGraphPage(): Promise<GraphPageData> {
  const ctx = await requireWorkspace();
  const schema = await engine.describeSchema(ctx.workspaceId, ctx.principalId);
  const collections = schema.collections ?? [];
  const nodes: GraphPageData['nodes'] = [];
  const edges: GraphPageData['edges'] = [];
  const seen = new Set<string>();

  async function addRecord(
    collection: string,
    recordId: string,
    remaining: number,
  ) {
    const key = `${collection}:${recordId}`;
    if (seen.has(key)) return;
    const record = await engine.readRecord(
      ctx.workspaceId,
      ctx.principalId,
      collection,
      recordId,
    );
    if (!record) return;
    seen.add(key);
    nodes.push({
      id: key,
      collection,
      label: recordLabel(record),
    });
    if (remaining <= 0) return;
    const related = await engine.listRelated(
      ctx.workspaceId,
      ctx.principalId,
      collection,
      recordId,
    );
    for (const edge of related.outgoing) {
      const targetKey = `${edge.collection}:${edge.recordId}`;
      edges.push({ from: key, to: targetKey, field: edge.field });
      await addRecord(edge.collection, edge.recordId, remaining - 1);
    }
    for (const edge of related.incoming) {
      const sourceKey = `${edge.collection}:${edge.recordId}`;
      edges.push({ from: sourceKey, to: key, field: edge.field });
      await addRecord(edge.collection, edge.recordId, remaining - 1);
    }
  }

  for (const collection of collections.slice(0, 8)) {
    const rows = await engine.query(ctx.workspaceId, ctx.principalId, {
      collection: collection.name,
      limit: 20,
    });
    for (const row of rows) {
      if (typeof row.id !== 'string') continue;
      await addRecord(collection.name, row.id, 1);
    }
  }

  const wikiEdges = await engine.listWikiLinkEdges(
    ctx.workspaceId,
    ctx.principalId,
  );
  const edgeKeys = new Set(edges.map((e) => `${e.from}->${e.to}:${e.field}`));
  for (const wiki of wikiEdges) {
    const fromKey = `${wiki.fromCollection}:${wiki.fromRecordId}`;
    const toKey = `${wiki.toCollection}:${wiki.toRecordId}`;
    if (!seen.has(fromKey)) {
      await addRecord(wiki.fromCollection, wiki.fromRecordId, 0);
    }
    if (!seen.has(toKey)) {
      await addRecord(wiki.toCollection, wiki.toRecordId, 0);
    }
    if (!seen.has(fromKey) || !seen.has(toKey)) continue;
    const field = `wiki:${wiki.rawTarget}`;
    const dedupe = `${fromKey}->${toKey}:${field}`;
    if (edgeKeys.has(dedupe)) continue;
    edgeKeys.add(dedupe);
    edges.push({ from: fromKey, to: toKey, field });
  }

  return { nodes, edges };
}
