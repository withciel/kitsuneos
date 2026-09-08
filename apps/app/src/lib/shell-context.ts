export type ShellCrumb = {
  label: string;
  href?: string;
};

export type ShellContextState = {
  title?: string;
  crumbs?: ShellCrumb[];
};

export const SHELL_CONTEXT_EVENT = 'kitsune:shell-context';

export function setShellContext(state: ShellContextState | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ShellContextState | null>(SHELL_CONTEXT_EVENT, {
      detail: state,
    }),
  );
}
