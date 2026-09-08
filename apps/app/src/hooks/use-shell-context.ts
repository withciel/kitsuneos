'use client';

import { useEffect } from 'react';
import {
  type ShellContextState,
  type ShellCrumb,
  setShellContext,
} from '@/lib/shell-context';

/** Publishes contextual title/crumbs to the workspace shell header. */
export function useShellContext(state: ShellContextState | null): void {
  const enabled = state !== null;
  const title = state?.title;
  const crumbsJson = state?.crumbs ? JSON.stringify(state.crumbs) : '';

  useEffect(() => {
    if (!enabled) {
      setShellContext(null);
      return () => setShellContext(null);
    }
    const crumbs = crumbsJson
      ? (JSON.parse(crumbsJson) as ShellCrumb[])
      : undefined;
    setShellContext({ title, crumbs });
    return () => setShellContext(null);
  }, [enabled, title, crumbsJson]);
}
