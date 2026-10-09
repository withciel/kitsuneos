'use client';

import type { CollectionView } from '@kitsuneos/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FieldMeta } from '@/components/page/field-control';
import { WORKSPACE_CHANGED_EVENT } from '@/lib/workspace-events';

export interface WorkspaceMe {
  userId: string;
  workspaceId: string;
  principalId?: string;
  role?: string;
  email?: string | null;
  hasApiKey?: boolean;
  apiKeyPlaintext?: string | null;
}

export interface WorkspaceSchemaCollection {
  id?: string;
  name: string;
  capability?: string;
  scope?: 'workspace' | 'personal';
  ownerPrincipalId?: string | null;
  fields: FieldMeta[];
  views?: CollectionView[];
}

export interface WorkspaceSchema {
  collections: WorkspaceSchemaCollection[];
}

export interface WorkspaceSessionSnapshot {
  me: WorkspaceMe | null;
  schema: WorkspaceSchema | null;
  openChangeSetCount: number;
  error: string | null;
  unauthorized: boolean;
}

export interface WorkspaceSessionValue extends WorkspaceSessionSnapshot {
  loading: boolean;
  refresh: () => Promise<WorkspaceSessionSnapshot>;
}

const WorkspaceSessionContext = createContext<WorkspaceSessionValue | null>(
  null,
);

async function fetchWorkspaceSession(): Promise<WorkspaceSessionSnapshot> {
  const [meRes, schemaRes, reviewRes] = await Promise.all([
    fetch('/api/me'),
    fetch('/api/schema'),
    fetch('/api/review?scope=open'),
  ]);

  const unauthorized = meRes.status === 401 || schemaRes.status === 401;
  let me: WorkspaceMe | null = null;
  let schema: WorkspaceSchema | null = null;
  let openChangeSetCount = 0;
  let error: string | null = null;

  if (meRes.ok) {
    me = (await meRes.json()) as WorkspaceMe;
  } else if (!unauthorized) {
    const body = (await meRes.json().catch(() => ({}))) as { error?: string };
    error = body.error ?? 'Could not load workspace identity';
  }

  if (schemaRes.ok) {
    const body = (await schemaRes.json()) as {
      collections?: WorkspaceSchemaCollection[];
      error?: string;
    };
    schema = { collections: body.collections ?? [] };
  } else if (!unauthorized) {
    const body = (await schemaRes.json().catch(() => ({}))) as {
      error?: string;
    };
    error = error ?? body.error ?? 'Could not load schema';
  }

  if (reviewRes.ok) {
    const body = (await reviewRes.json()) as { changeSets?: unknown[] };
    openChangeSetCount = body.changeSets?.length ?? 0;
  }

  if (unauthorized) {
    error = error ?? 'Unauthorized';
  }

  return { me, schema, openChangeSetCount, error, unauthorized };
}

export function WorkspaceSessionProvider({
  children,
  initialSnapshot,
}: {
  children: ReactNode;
  initialSnapshot?: WorkspaceSessionSnapshot | null;
}) {
  const hasInitial = Boolean(initialSnapshot && !initialSnapshot.unauthorized);
  const [me, setMe] = useState<WorkspaceMe | null>(initialSnapshot?.me ?? null);
  const [schema, setSchema] = useState<WorkspaceSchema | null>(
    initialSnapshot?.schema ?? null,
  );
  const [openChangeSetCount, setOpenChangeSetCount] = useState(
    initialSnapshot?.openChangeSetCount ?? 0,
  );
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState<string | null>(
    initialSnapshot?.error ?? null,
  );
  const [unauthorized, setUnauthorized] = useState(
    initialSnapshot?.unauthorized ?? false,
  );
  const requestIdRef = useRef(0);
  const bootstrappedRef = useRef(hasInitial);

  const refresh = useCallback(async (): Promise<WorkspaceSessionSnapshot> => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const snapshot = await fetchWorkspaceSession();
      if (requestId !== requestIdRef.current) {
        return snapshot;
      }
      setMe(snapshot.me);
      setSchema(snapshot.schema);
      setOpenChangeSetCount(snapshot.openChangeSetCount);
      setError(snapshot.error);
      setUnauthorized(snapshot.unauthorized);
      return snapshot;
    } catch (err) {
      const snapshot: WorkspaceSessionSnapshot = {
        me: null,
        schema: null,
        openChangeSetCount: 0,
        error:
          err instanceof Error
            ? err.message
            : 'Could not reach the workspace API',
        unauthorized: false,
      };
      if (requestId !== requestIdRef.current) {
        return snapshot;
      }
      setError(snapshot.error);
      setUnauthorized(false);
      return snapshot;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) {
      bootstrappedRef.current = false;
      return;
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onWorkspaceChanged() {
      void refresh();
    }
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onWorkspaceChanged);
    };
  }, [refresh]);

  const value = useMemo<WorkspaceSessionValue>(
    () => ({
      me,
      schema,
      openChangeSetCount,
      loading,
      error,
      unauthorized,
      refresh,
    }),
    [me, schema, openChangeSetCount, loading, error, unauthorized, refresh],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession(): WorkspaceSessionValue {
  const ctx = useContext(WorkspaceSessionContext);
  if (!ctx) {
    throw new Error(
      'useWorkspaceSession must be used within WorkspaceSessionProvider',
    );
  }
  return ctx;
}
