'use client';

import type { WidgetTokenScope } from '@kitsuneos/workos';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useWorkOsWidgetToken(scopes?: WidgetTokenScope[]) {
  const [token, setToken] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scopesKey = useMemo(
    () => (scopes && scopes.length > 0 ? scopes.join(',') : ''),
    [scopes],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scopeList = scopesKey
        ? (scopesKey.split(',') as WidgetTokenScope[])
        : undefined;
      const response = await fetch('/api/workos/widget-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scopeList ? { scopes: scopeList } : {}),
      });
      const body = (await response.json()) as {
        token?: string | null;
        organizationId?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not load WorkOS widget token');
        setToken(null);
        return;
      }
      setToken(body.token ?? null);
      setOrganizationId(body.organizationId ?? null);
    } catch {
      setError('Could not load WorkOS widget token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [scopesKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { token, organizationId, error, loading, reload };
}
