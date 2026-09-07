'use client';

import { drag as d3Drag } from 'd3-drag';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { select } from 'd3-selection';
import { type D3ZoomEvent, zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { pageHref } from '@/lib/page';

export interface GraphNode {
  id: string;
  collection: string;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  field: string;
}

interface SimNode extends SimulationNodeDatum, GraphNode {}
interface SimLink extends SimulationLinkDatum<SimNode> {
  field: string;
}

const NODE_RADIUS = 18;

/**
 * Interactive force-directed graph: drag to reposition, wheel/pinch to
 * zoom + pan, click a node to navigate to its page, hover to highlight its
 * immediate edges/neighbors.
 */
export function ForceGraph({
  nodes,
  edges,
  width = 960,
  height = 640,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomLayerRef = useRef<SVGGElement | null>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);

  const nodeKey = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const zoomLayerEl = zoomLayerRef.current;
    if (!svgEl || !zoomLayerEl) return;
    if (nodes.length === 0) return;

    const simNodes: SimNode[] = nodes.map((node) => ({ ...node }));
    const nodeById = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = edges
      .filter((edge) => nodeKey.has(edge.from) && nodeKey.has(edge.to))
      .map((edge) => ({
        source: nodeById.get(edge.from)!,
        target: nodeById.get(edge.to)!,
        field: edge.field,
      }));

    const neighborMap = new Map<string, Set<string>>();
    for (const link of simLinks) {
      const sourceId = (link.source as SimNode).id;
      const targetId = (link.target as SimNode).id;
      if (!neighborMap.has(sourceId)) neighborMap.set(sourceId, new Set());
      if (!neighborMap.has(targetId)) neighborMap.set(targetId, new Set());
      neighborMap.get(sourceId)!.add(targetId);
      neighborMap.get(targetId)!.add(sourceId);
    }

    const svg = select(svgEl);
    const zoomLayer = select(zoomLayerEl);
    const linkLayer = zoomLayer.select<SVGGElement>('.links');
    const nodeLayer = zoomLayer.select<SVGGElement>('.nodes');

    const linkSelection = linkLayer
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('class', 'graph-edge')
      .attr('stroke', 'currentColor')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.35);

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes, (d) => d.id)
      .join((enter) => {
        const g = enter
          .append('g')
          .attr('class', 'graph-node cursor-pointer')
          .attr('tabindex', '0')
          .attr('role', 'link')
          .attr('aria-label', (d) => `Open ${d.collection} page ${d.label}`)
          .style('outline', 'none');
        g.append('circle')
          .attr('r', NODE_RADIUS)
          .attr('class', 'fill-primary/15 stroke-primary')
          .attr('stroke-width', 1.5);
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', NODE_RADIUS * 2)
          .attr('class', 'fill-foreground text-[11px] select-none')
          .text((d) => d.label.slice(0, 24));
        g.append('title').text((d) => `${d.collection}: ${d.label}`);
        return g;
      });

    function openNode(d: SimNode) {
      const recordId = d.id.slice(d.collection.length + 1);
      router.push(pageHref(recordId, d.collection));
    }

    function setHighlight(activeId: string | null) {
      const neighbors = activeId ? neighborMap.get(activeId) : undefined;
      nodeSelection.attr('opacity', (d) => {
        if (!activeId) return 1;
        if (d.id === activeId) return 1;
        return neighbors?.has(d.id) ? 1 : 0.25;
      });
      linkSelection
        .attr('stroke-opacity', (l) => {
          if (!activeId) return 0.35;
          const sourceId = (l.source as SimNode).id;
          const targetId = (l.target as SimNode).id;
          return sourceId === activeId || targetId === activeId ? 0.9 : 0.08;
        })
        .attr('stroke-width', (l) => {
          if (!activeId) return 1.5;
          const sourceId = (l.source as SimNode).id;
          const targetId = (l.target as SimNode).id;
          return sourceId === activeId || targetId === activeId ? 2.5 : 1.5;
        });
    }

    nodeSelection
      .on('mouseenter', (_event, d) => setHighlight(d.id))
      .on('mouseleave', () => setHighlight(null))
      .on('focus', (event, d) => {
        setHighlight(d.id);
        select(event.currentTarget as SVGGElement)
          .select('circle')
          .attr('stroke-width', 3);
      })
      .on('blur', (event) => {
        setHighlight(null);
        select(event.currentTarget as SVGGElement)
          .select('circle')
          .attr('stroke-width', 1.5);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        openNode(d);
      })
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          openNode(d);
        }
      });

    const dragBehavior = d3Drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulationRef.current?.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    nodeSelection.call(dragBehavior);

    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomLayer.attr('transform', event.transform.toString());
      });
    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, zoomIdentity);
    svg.on('click', () => setHighlight(null));

    const simulation = forceSimulation(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(90)
          .strength(0.4),
      )
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(NODE_RADIUS + 8))
      .on('tick', () => {
        linkSelection
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0);
        nodeSelection.attr(
          'transform',
          (d) => `translate(${d.x ?? 0},${d.y ?? 0})`,
        );
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      simulationRef.current = null;
      linkLayer.selectAll('*').remove();
      nodeLayer.selectAll('*').remove();
      svg.on('.zoom', null);
      svg.on('click', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when data or size changes
  }, [nodes, edges, nodeKey, width, height, router]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="h-[640px] w-full touch-none"
      role="application"
      aria-label="Interactive workspace page graph. Tab to nodes, Enter to open."
    >
      <g ref={zoomLayerRef}>
        <g className="links" />
        <g className="nodes" />
      </g>
    </svg>
  );
}
