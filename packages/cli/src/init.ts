import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA_STUB = `{
  "collections": [
    {
      "name": "accounts",
      "fields": [
        { "name": "name", "type": "text", "nullable": false },
        { "name": "industry", "type": "text" }
      ]
    },
    {
      "name": "contacts",
      "fields": [
        {
          "name": "account_id",
          "type": "relation",
          "relationTarget": "accounts",
          "nullable": false
        },
        { "name": "name", "type": "text", "nullable": false },
        { "name": "email", "type": "text" }
      ]
    },
    {
      "name": "opportunities",
      "fields": [
        {
          "name": "account_id",
          "type": "relation",
          "relationTarget": "accounts",
          "nullable": false
        },
        { "name": "name", "type": "text", "nullable": false },
        { "name": "amount", "type": "number" },
        {
          "name": "stage",
          "type": "enum",
          "nullable": false,
          "enumValues": ["prospecting", "negotiation", "closed_won", "closed_lost"],
          "indexed": true
        },
        { "name": "next_step", "type": "prose" }
      ]
    }
  ]
}
`;

const ENV_EXAMPLE = `KITSUNE_OWNER_URL=postgresql://kitsune_owner:kitsune_owner@localhost:5432/kitsune
KITSUNE_APP_URL=postgresql://kitsune_app:kitsune_app@localhost:5432/kitsune
KITSUNE_WORKSPACE_ID=
KITSUNE_PRINCIPAL_ID=
`;

export function init(cwd = process.cwd()): string[] {
  const written: string[] = [];
  const schemaPath = resolve(cwd, 'kitsune.schema.json');
  const envPath = resolve(cwd, '.env.example');
  writeFileSync(schemaPath, SCHEMA_STUB);
  written.push(schemaPath);
  writeFileSync(envPath, ENV_EXAMPLE);
  written.push(envPath);
  console.log(`Wrote ${schemaPath}`);
  console.log(`Wrote ${envPath}`);
  return written;
}
