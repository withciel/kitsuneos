/**
 * Plain-language, Claude-style access labels.
 *
 * Agents may hold the same capability ladder as humans (Q1 reopened —
 * `propose` remains the recommended default for agents, not a hard ceiling).
 * `admin` means "Full control": edit records and manage access for the
 * database, for any principal kind.
 */

export type AccessLevel = 'none' | 'read' | 'propose' | 'write' | 'admin';

export const ACCESS_LEVELS: Array<{
  value: AccessLevel;
  label: string;
  description: string;
}> = [
  {
    value: 'none',
    label: 'No Access',
    description: 'Cannot see or change records.',
  },
  {
    value: 'read',
    label: 'Read Only',
    description: 'Can see records, cannot change them.',
  },
  {
    value: 'propose',
    label: 'Change Request',
    description:
      'Can propose edits; a reviewer approves or rejects them in Changes before they apply.',
  },
  {
    value: 'write',
    label: 'Full write',
    description: 'Can change records directly, without waiting for approval.',
  },
  {
    value: 'admin',
    label: 'Full control',
    description:
      'Can edit records directly and manage access for this database.',
  },
];

export function accessLabel(capability: string): string {
  return (
    ACCESS_LEVELS.find((level) => level.value === capability)?.label ??
    capability
  );
}

export function accessDescription(capability: string): string {
  return (
    ACCESS_LEVELS.find((level) => level.value === capability)?.description ?? ''
  );
}

export function personKindLabel(kind: string): string {
  if (kind === 'agent') return 'AI';
  if (kind === 'human') return 'Person';
  if (kind === 'team') return 'Team';
  return kind;
}
