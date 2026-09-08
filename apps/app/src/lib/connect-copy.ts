export const MCP_CONSENT_UI_SHIPPED = true;

export function cursorRemoteSteps(origin = ''): string[] {
  const mcpUrl = origin ? `${origin}/api/mcp` : 'your KitsuneOS MCP URL';
  if (MCP_CONSENT_UI_SHIPPED) {
    return [
      'In Cursor, open Settings → MCP.',
      'Add a server with a url (not command). Do not add Authorization headers.',
      `Paste ${mcpUrl} — Cursor discovers OAuth and opens a browser login.`,
      'Sign in, then Approve access for your workspace on the consent screen.',
      'Return to Cursor when the connector finishes.',
      'Ask Cursor to describe your schema to confirm initialize + tools/call work.',
    ];
  }
  return [
    'In Cursor, open Settings → MCP.',
    'Add a server with a url (not command). Do not add Authorization headers.',
    `Paste ${mcpUrl} — Cursor discovers OAuth and opens a browser login.`,
    'Sign in to KitsuneOS when redirected. Signing in grants MCP access for your active workspace (there is no separate Approve screen yet).',
    'Return to Cursor when the connector finishes.',
    'Ask Cursor to describe your schema to confirm initialize + tools/call work.',
  ];
}

export function claudeConnectorSteps(origin = ''): string[] {
  const mcpUrl = origin ? `${origin}/api/mcp` : 'your KitsuneOS MCP URL';
  if (MCP_CONSENT_UI_SHIPPED) {
    return [
      'In Claude (web or desktop), open Settings → Connectors.',
      'Add a custom connector.',
      `Remote MCP URL: ${mcpUrl}`,
      'Complete the OAuth consent when prompted (no API key paste).',
      'Enable tools for the conversation, then ask Claude to describe your schema.',
      'Requires the remote OAuth MCP endpoint (already at /api/mcp).',
      'Do not paste a url block into claude_desktop_config.json — Desktop local configs are stdio only.',
      'Use Connectors → Add custom connector with the URL below and finish OAuth.',
    ];
  }
  return [
    'In Claude (web or desktop), open Settings → Connectors.',
    'Add a custom connector.',
    `Remote MCP URL: ${mcpUrl}`,
    'Sign in to KitsuneOS when redirected. Signing in grants MCP access for your active workspace (no API key paste; there is no separate Approve screen yet).',
    'Enable tools for the conversation, then ask Claude to describe your schema.',
    'Requires the remote OAuth MCP endpoint (already at /api/mcp).',
    'Do not paste a url block into claude_desktop_config.json — Desktop local configs are stdio only.',
    'Use Connectors → Add custom connector with the URL below and sign in to finish setup.',
  ];
}

export function claudeRemoteSnippet(origin: string): string {
  const steps = claudeConnectorSteps(origin).slice(0, 5);
  return steps.join('\n');
}

export function allConnectGuideSteps(origin = ''): string[] {
  return [...cursorRemoteSteps(origin), ...claudeConnectorSteps(origin)];
}
