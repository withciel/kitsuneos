export interface SchemaField {
  name: string;
  type: string;
  nullable?: boolean;
  relationTarget?: string;
  enumValues?: string[];
}

export interface SchemaCollection {
  name: string;
  fields: SchemaField[];
}

export interface CollectionSchema {
  collections: SchemaCollection[];
}

function singularize(name: string): string {
  if (name.endsWith('ies') && name.length > 3) {
    return `${name.slice(0, -3)}y`;
  }
  if (name.endsWith('s') && !name.endsWith('ss') && name.length > 1) {
    return name.slice(0, -1);
  }
  return name;
}

function pascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function tsType(field: SchemaField): string {
  switch (field.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

export function generateClientSource(schema: CollectionSchema): string {
  const blocks: string[] = [
    '/* Generated from collection definitions. Do not edit. */',
    '',
  ];
  for (const collection of schema.collections) {
    const typeName = pascalCase(singularize(collection.name));
    const lines = [`export interface ${typeName} {`, '  id: string;'];
    for (const field of collection.fields) {
      const optional = field.nullable === false ? '' : '?';
      const value =
        field.nullable === false ? tsType(field) : `${tsType(field)} | null`;
      lines.push(`  ${field.name}${optional}: ${value};`);
    }
    lines.push('}', '');
    blocks.push(lines.join('\n'));
  }
  return `${blocks.join('\n').trimEnd()}\n`;
}

export function parseSchemaJson(raw: string): CollectionSchema {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as CollectionSchema).collections)
  ) {
    throw new Error('Schema fixture must be { collections: [...] }');
  }
  return parsed as CollectionSchema;
}

export function runCodegen(options: {
  fixturePath: string;
  outputPath: string;
  check?: boolean;
  readFile: (path: string) => string;
  writeFile?: (path: string, contents: string) => void;
}): { source: string; changed: boolean } {
  const schema = parseSchemaJson(options.readFile(options.fixturePath));
  const source = generateClientSource(schema);
  let existing = '';
  try {
    existing = options.readFile(options.outputPath);
  } catch {
    existing = '';
  }
  const changed = existing !== source;
  if (!options.check && changed) {
    options.writeFile?.(options.outputPath, source);
  }
  return { source, changed };
}
