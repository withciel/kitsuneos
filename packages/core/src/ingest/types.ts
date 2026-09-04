import type { JsonValue } from '../types.js';

export interface IngestRecord {
  id?: string;
  fields: Record<string, JsonValue>;
}

export interface IngestRequest {
  collection: string;
  records: IngestRecord[];
  /** auto: directWrite when capability ≥ write, else propose. */
  mode?: 'auto' | 'propose' | 'direct';
}

export interface IngestResult {
  written: string[];
  changeSetIds: string[];
  errors: Array<{ index: number; error: string }>;
}

export type IngestSourceKind = 'cms' | 'crm' | 'kb' | 'tickets';

export interface ParsedIngestBatch {
  collection: string;
  records: IngestRecord[];
}
