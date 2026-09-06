/** Plain-language labels for access levels (non-technical UI). */

export type AccessLevel = 'read' | 'propose' | 'write' | 'admin';

export const ACCESS_LEVELS: Array<{
  value: AccessLevel;
  label: string;
  description: string;
  /** Hide from the simple form when the recipient is an AI. */
  humansOnly?: boolean;
}> = [
  {
    value: 'read',
    label: 'View only',
    description: 'Can see records, cannot change them.',
  },
  {
    value: 'propose',
    label: 'Suggest changes',
    description:
      'Can propose edits; you review them in Inbox before they apply.',
  },
  {
    value: 'write',
    label: 'Edit directly',
    description: 'Can change records without waiting for approval.',
    humansOnly: true,
  },
  {
    value: 'admin',
    label: 'Full control',
    description: 'Can edit records and manage access for this database.',
    humansOnly: true,
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
