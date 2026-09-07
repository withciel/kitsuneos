import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Thin pointer to the Agents page — full agent CRUD (create, membership,
 * access, activity) lives there now. Connect only picks an agent to mint
 * an MCP token for.
 */
export function AgentsPanel() {
  return (
    <section className="space-y-2 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-medium">Agents</h3>
        <p className="text-sm text-muted-foreground">
          Create agents, set their membership (workspace / team / personal), and
          manage access on the Agents page.
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/agents">Open Agents</Link>
      </Button>
    </section>
  );
}
