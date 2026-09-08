'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ForceGraph,
  type GraphEdge,
  type GraphNode,
} from '@/components/graph/force-graph';
import { OperateEmptyState } from '@/components/operate/empty-state';
import { OperatePageHeader } from '@/components/operate/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
    <div className="flex flex-1 flex-col">
      <OperatePageHeader
        title="Graph"
        description="How pages you can see link together. Drag to rearrange, scroll to zoom, click a node to open its page."
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={reload}
              disabled={loading}
            >
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/api/graph" target="_blank">
                    Open as JSON
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="operate-enter flex flex-1 flex-col gap-3 px-6 py-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="min-h-[480px] flex-1 overflow-hidden border border-border bg-background">
          {nodes.length === 0 && !loading ? (
            <OperateEmptyState
              className="h-full justify-center py-16"
              title="No pages to map yet"
              description="Create pages in a database, then return here to see how they link."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/">Go to databases</Link>
                </Button>
              }
            />
          ) : (
            <ForceGraph nodes={nodes} edges={edges} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {loading
            ? 'Loading graph…'
            : `${nodes.length} pages · ${edges.length} links`}
        </p>
      </div>
    </div>
  );
}
