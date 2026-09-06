'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { pageHref } from '@/lib/page';

interface GraphNode {
  id: string;
  collection: string;
  label: string;
}

interface GraphEdge {
  from: string;
  to: string;
  field: string;
}

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

  const layout = useMemo(() => {
    const width = 960;
    const height = 640;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.38;
    const positions = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      positions.set(node.id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    });
    return { width, height, positions };
  }, [nodes]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Graph</h1>
          <p className="text-sm text-muted-foreground">
            Pages you can see and how they link.
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
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-[640px] w-full"
          role="img"
          aria-label="Workspace page graph"
        >
          {edges.map((edge) => {
            const from = layout.positions.get(edge.from);
            const to = layout.positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}-${edge.field}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="currentColor"
                className="text-border"
                strokeWidth={1.5}
              />
            );
          })}
          {nodes.map((node) => {
            const position = layout.positions.get(node.id);
            if (!position) return null;
            const recordId = node.id.slice(node.collection.length + 1);
            return (
              <g
                key={node.id}
                transform={`translate(${position.x},${position.y})`}
              >
                <circle
                  r={18}
                  className="fill-primary/15 stroke-primary"
                  strokeWidth={1.5}
                />
                <a href={pageHref(recordId, node.collection)}>
                  <title>{`${node.collection}: ${node.label}`}</title>
                  <text
                    textAnchor="middle"
                    dy={36}
                    className="fill-foreground text-[11px]"
                  >
                    {node.label.slice(0, 24)}
                  </text>
                </a>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        {loading ? 'Loading…' : `${nodes.length} nodes · ${edges.length} edges`}
      </p>
    </div>
  );
}
