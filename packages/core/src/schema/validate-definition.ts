import type { CollectionDefinition, FieldDefinition } from '../types.js';
import { KitsuneError, SYSTEM_COLUMNS } from '../types.js';

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
const MAX_FIELDS = 50;

const RESERVED_NAMES = new Set(['id', ...SYSTEM_COLUMNS]);

function isReservedRevName(name: string): boolean {
  return name.endsWith('__rev') || RESERVED_NAMES.has(name);
}

export function assertIdentifier(name: string, label: string): void {
  if (!IDENT_RE.test(name)) {
    throw new KitsuneError(`Invalid ${label}: ${name}`, 'validation');
  }
  if (isReservedRevName(name)) {
    throw new KitsuneError(`Reserved ${label}: ${name}`, 'validation');
  }
}

export function validateEnumValue(value: string): void {
  if (!value || value.length > 128) {
    throw new KitsuneError('Invalid enum value', 'validation');
  }
  if (value.includes("'") || value.includes(';') || value.includes('--')) {
    throw new KitsuneError('Invalid enum value', 'validation');
  }
}

export function validateFieldDefinition(field: FieldDefinition): void {
  assertIdentifier(field.name, 'field name');
  if (field.type === 'enum' && field.enumValues) {
    for (const value of field.enumValues) {
      validateEnumValue(value);
    }
  }
  if (field.type === 'relation' && field.relationTarget) {
    assertIdentifier(field.relationTarget, 'relation target');
  }
}

export function validateCollectionDefinition(
  definition: CollectionDefinition,
): void {
  assertIdentifier(definition.name, 'collection name');
  if (definition.fields.length > MAX_FIELDS) {
    throw new KitsuneError(`Too many fields (max ${MAX_FIELDS})`, 'validation');
  }
  const names = new Set<string>();
  for (const field of definition.fields) {
    validateFieldDefinition(field);
    if (names.has(field.name)) {
      throw new KitsuneError(`Duplicate field: ${field.name}`, 'validation');
    }
    names.add(field.name);
  }
}
