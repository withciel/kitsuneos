'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface WebhookEndpointRow {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

interface WebhookDeliveryRow {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  createdAt?: string;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

export function WebhooksPanel() {
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch('/api/webhooks');
    const body = (await response.json()) as {
      endpoints?: WebhookEndpointRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(
        response.status === 403
          ? 'Only workspace owners and admins can manage webhooks.'
          : (body.error ?? 'Could not load webhooks'),
      );
      return;
    }
    setError('');
    setEndpoints(body.endpoints ?? []);
  }, []);

  useEffect(() => {
    void reload().catch(() => setError('Could not load webhooks'));
  }, [reload]);

  const loadDeliveries = useCallback(async (endpointId: string) => {
    setDeliveriesLoading(true);
    try {
      const response = await fetch(
        `/api/webhooks/${encodeURIComponent(endpointId)}/deliveries`,
      );
      const body = (await response.json()) as {
        deliveries?: WebhookDeliveryRow[];
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not load deliveries');
        setDeliveries([]);
        return;
      }
      setDeliveries(body.deliveries ?? []);
    } finally {
      setDeliveriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDeliveries([]);
      return;
    }
    void loadDeliveries(selectedId);
  }, [selectedId, loadDeliveries]);

  async function createEndpoint() {
    if (!url.trim()) {
      setError('Enter a delivery URL.');
      return;
    }
    setBusy(true);
    setError('');
    setCreatedSecret(null);
    try {
      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = (await response.json()) as {
        endpoint?: { id: string };
        secret?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not create webhook');
        return;
      }
      setCreatedSecret(body.secret ?? null);
      setUrl('');
      if (body.endpoint?.id) setSelectedId(body.endpoint.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create webhook');
    } finally {
      setBusy(false);
    }
  }

  async function deleteEndpoint(endpointId: string) {
    if (!window.confirm('Delete this webhook endpoint?')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/webhooks/${encodeURIComponent(endpointId)}`,
        { method: 'DELETE' },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not delete webhook');
        return;
      }
      if (selectedId === endpointId) setSelectedId(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Webhooks</h2>
        <p className="text-sm text-muted-foreground">
          Outbound HTTPS notifications when change sets apply. Verify{' '}
          <code className="text-xs">x-kitsune-signature</code> with the secret
          shown once at create time — secrets are never listed again.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {createdSecret ? (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-3 text-sm">
          <p className="font-medium">Copy this signing secret now</p>
          <p className="text-muted-foreground">
            It will not be shown again. Store it with your receiver.
          </p>
          <code className="block break-all rounded bg-background px-2 py-1 font-mono text-xs">
            {createdSecret}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(createdSecret);
            }}
          >
            Copy secret
          </Button>
        </div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-medium">Add endpoint</h3>
          <p className="text-xs text-muted-foreground">
            Defaults to <code className="font-mono">change_set.applied</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              className="w-80"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/hooks/kitsune"
            />
          </div>
          <Button disabled={busy} onClick={() => void createEndpoint()}>
            {busy ? 'Saving…' : 'Create'}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No webhook endpoints yet.
                </TableCell>
              </TableRow>
            ) : (
              endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell className="max-w-xs truncate font-medium">
                    {endpoint.url}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {endpoint.events.join(', ')}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatWhen(endpoint.createdAt)}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setSelectedId(endpoint.id)}
                    >
                      Deliveries
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void deleteEndpoint(endpoint.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedId ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Recent deliveries</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={deliveriesLoading}
              onClick={() => void loadDeliveries(selectedId)}
            >
              {deliveriesLoading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      {deliveriesLoading
                        ? 'Loading…'
                        : 'No deliveries recorded yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatWhen(delivery.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {delivery.eventType}
                      </TableCell>
                      <TableCell className="text-xs">
                        {delivery.status}
                      </TableCell>
                      <TableCell className="text-xs">
                        {delivery.attemptCount}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {delivery.lastError ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
