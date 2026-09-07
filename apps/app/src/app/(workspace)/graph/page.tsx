'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ForceGraph,
  type GraphEdge,
  type GraphNode,
} from '@/components/graph/force-graph';
import { Button } from '@/components/ui/button';

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    void fetch('/api/graph')
      .then(async (response) => {
        const body = (await response.json()) as {
          nodes?: GraphNode[];
          edges?: GraphEdge[];
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? 'Could not load graph');
          return;
        }
        setNodes(body.nodes ?? []);
        setEdges(body.edges ?? []);
        setError('');
      })
      .catch(() => setError('Could not load graph'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Graph</h1>
          <p className="text-sm text-muted-foreground">
            Pages you can see and how they link. Drag nodes to rearrange, scroll
            or pinch to zoom, hover to trace connections, and click a node to
            open its page.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reload} disabled={loading}>
            Refresh
          </Button>
          <Button asChild variant="secondary">
            <Link href="/api/graph" target="_blank">
              Open JSON
            </Link>
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {nodes.length === 0 && !loading ? (
          <div className="flex h-[640px] items-center justify-center text-sm text-muted-foreground">
            No pages to show yet.
          </div>
        ) : (
          <ForceGraph nodes={nodes} edges={edges} />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {loading ? 'Loading…' : `${nodes.length} nodes · ${edges.length} edges`}
      </p>
    </div>
  );
}
