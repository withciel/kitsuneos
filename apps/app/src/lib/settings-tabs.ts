/** Notion-like Settings chrome — no pages/databases/schema tabs. */
export const SETTINGS_TABS = [
  { href: '/settings/workspace', label: 'Account' },
  { href: '/settings/people', label: 'People' },
  { href: '/settings/teams', label: 'Teams' },
  { href: '/settings/access', label: 'Access' },
  { href: '/settings/connect', label: 'Connect AI' },
] as const;

export const SETTINGS_TAB_LABELS = SETTINGS_TABS.map((tab) => tab.label);
