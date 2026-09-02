import type { FieldDefinition, FieldType } from '../types.js';
import {
  assertSchemaName,
  escapeSqlStringLiteral,
  quoteIdent,
  revTableName,
} from '../types.js';

function policySchemaLiteral(schemaName: string): string {
  assertSchemaName(schemaName);
  return `'${escapeSqlStringLiteral(schemaName)}'`;
}

function pgType(field: FieldDefinition): string {
  switch (field.type as FieldType) {
    case 'text':
    case 'prose':
    case 'enum':
      return 'text';
    case 'number':
      return 'numeric(14,2)';
    case 'boolean':
      return 'boolean';
    case 'timestamp':
      return 'timestamptz';
    case 'relation':
      return 'uuid';
    default:
      throw new Error(`Unknown field type: ${field.type}`);
  }
}

export function generateCollectionDdl(
  schemaName: string,
  tableName: string,
  fields: FieldDefinition[],
  relationTargets: Map<string, { schemaName: string; tableName: string }>,
): string[] {
  const stmts: string[] = [];
  const qSchema = quoteIdent(schemaName);
  const qTable = quoteIdent(tableName);
  const qRev = quoteIdent(revTableName(tableName));

  const columnDefs: string[] = [
    'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
  ];

  for (const field of fields) {
    const col = quoteIdent(field.name);
    const isNullable = field.nullable !== false;
    let def = `${col} ${pgType(field)}`;
    if (!isNullable && field.type !== 'relation') {
      def += ' NOT NULL';
    }
    if (field.type === 'enum' && field.enumValues?.length) {
      const values = field.enumValues
        .map((v) => `'${escapeSqlStringLiteral(v)}'`)
        .join(', ');
      def += ` CHECK (${col} IN (${values}))`;
    }
    if (field.type === 'relation') {
      const target = relationTargets.get(field.name);
      if (!target) {
        throw new Error(`Missing relation target for ${field.name}`);
      }
      if (field.nullable === false) {
        def += ' NOT NULL';
      }
      def += ` REFERENCES ${quoteIdent(target.schemaName)}.${quoteIdent(target.tableName)}(id) DEFERRABLE INITIALLY DEFERRED`;
    }
    columnDefs.push(def);
  }

  columnDefs.push(
    '_revision bigint NOT NULL DEFAULT 1',
    '_updated_at timestamptz NOT NULL DEFAULT now()',
    '_updated_by uuid NOT NULL',
    '_deleted_at timestamptz',
  );

  stmts.push(
    `CREATE TABLE IF NOT EXISTS ${qSchema}.${qTable} (\n  ${columnDefs.join(',\n  ')}\n);`,
  );

  for (const field of fields) {
    if (field.indexed || field.type === 'relation') {
      stmts.push(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_${field.name}_idx`)} ON ${qSchema}.${qTable} (${quoteIdent(field.name)}) WHERE _deleted_at IS NULL;`,
      );
    }
  }

  stmts.push(`CREATE TABLE IF NOT EXISTS ${qSchema}.${qRev} (
  record_id uuid NOT NULL,
  revision bigint NOT NULL,
  snapshot jsonb NOT NULL,
  changed_fields text[] NOT NULL,
  change_set_id uuid,
  principal_id uuid NOT NULL,
  valid_from timestamptz NOT NULL,
  PRIMARY KEY (record_id, revision)
);`);
  stmts.push(
    `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}__rev_principal_idx`)} ON ${qSchema}.${qRev} (principal_id, valid_from);`,
  );

  stmts.push(`ALTER TABLE ${qSchema}.${qTable} ENABLE ROW LEVEL SECURITY;`);
  stmts.push(`ALTER TABLE ${qSchema}.${qTable} FORCE ROW LEVEL SECURITY;`);
  stmts.push(
    `DROP POLICY IF EXISTS kitsune_app_access ON ${qSchema}.${qTable};`,
  );
  stmts.push(`CREATE POLICY kitsune_app_access ON ${qSchema}.${qTable}
  TO kitsune_app
  USING (
    current_setting('kitsune.schema_name', true) = ${policySchemaLiteral(schemaName)}
    AND (_deleted_at IS NULL OR current_setting('kitsune.include_deleted', true) = 'true')
  );`);
  stmts.push(
    `DROP POLICY IF EXISTS kitsune_owner_bypass ON ${qSchema}.${qTable};`,
  );
  stmts.push(`CREATE POLICY kitsune_owner_bypass ON ${qSchema}.${qTable}
  TO kitsune_owner
  USING (true)
  WITH CHECK (true);`);

  stmts.push(`ALTER TABLE ${qSchema}.${qRev} ENABLE ROW LEVEL SECURITY;`);
  stmts.push(`ALTER TABLE ${qSchema}.${qRev} FORCE ROW LEVEL SECURITY;`);
  stmts.push(`DROP POLICY IF EXISTS kitsune_app_access ON ${qSchema}.${qRev};`);
  stmts.push(`CREATE POLICY kitsune_app_access ON ${qSchema}.${qRev}
  TO kitsune_app
  USING (current_setting('kitsune.schema_name', true) = ${policySchemaLiteral(schemaName)});`);
  stmts.push(
    `DROP POLICY IF EXISTS kitsune_owner_bypass ON ${qSchema}.${qRev};`,
  );
  stmts.push(`CREATE POLICY kitsune_owner_bypass ON ${qSchema}.${qRev}
  TO kitsune_owner
  USING (true)
  WITH CHECK (true);`);

  stmts.push(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${qSchema}.${qTable} TO kitsune_app;`,
  );
  stmts.push(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${qSchema}.${qRev} TO kitsune_app;`,
  );

  return stmts;
}

export function generateWorkspaceSchemaDdl(schemaName: string): string[] {
  return [
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)} AUTHORIZATION kitsune_owner;`,
    `GRANT USAGE ON SCHEMA ${quoteIdent(schemaName)} TO kitsune_app;`,
  ];
}
