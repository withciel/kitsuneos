'use client';

import type { JsonValue } from '@kitsuneos/core';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export const NONE_VALUE = '__none__';

export interface FieldMeta {
  name: string;
  type: string;
  writable: boolean;
  relationTarget?: string | null;
}

export interface RelationOption {
  id: string;
  label: string;
}

export function FieldControl({
  field,
  value,
  options,
  onChange,
  idPrefix = 'field',
  rows,
}: {
  field: FieldMeta;
  value: string;
  options: RelationOption[];
  onChange: (value: string) => void;
  idPrefix?: string;
  rows?: number;
}) {
  const id = `${idPrefix}-${field.name}`;

  if (field.type === 'prose') {
    return (
      <Textarea
        id={id}
        value={value}
        disabled={!field.writable}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <Select
        value={value === 'true' ? 'true' : 'false'}
        disabled={!field.writable}
        onValueChange={onChange}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'relation') {
    return (
      <Select
        value={value || NONE_VALUE}
        disabled={!field.writable}
        onValueChange={(next) => onChange(next === NONE_VALUE ? '' : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select related page" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      id={id}
      type={field.type === 'number' ? 'number' : 'text'}
      value={value}
      disabled={!field.writable}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function draftToPayload(
  fields: FieldMeta[],
  draft: Record<string, string>,
): Record<string, JsonValue> {
  const payload: Record<string, JsonValue> = {};
  for (const field of fields) {
    if (!field.writable) continue;
    const raw = draft[field.name] ?? '';
    if (field.type === 'number') {
      if (raw === '') {
        payload[field.name] = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          throw new Error(`Invalid number for ${field.name}`);
        }
        payload[field.name] = n;
      }
    } else if (field.type === 'boolean') {
      payload[field.name] = raw === 'true';
    } else if (field.type === 'relation') {
      payload[field.name] = raw === '' || raw === NONE_VALUE ? null : raw;
    } else {
      payload[field.name] = raw;
    }
  }
  return payload;
}

export function cellText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
