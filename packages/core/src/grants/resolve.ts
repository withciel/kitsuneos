import type { PoolClient } from 'pg';
import type { Capability, Predicate, ResolvedGrant } from '../types.js';
import { CAPABILITY_ORDER, KitsuneError } from '../types.js';

interface GrantRow {
  capability: Capability;
  field_mask: string[] | null;
  row_predicate: Predicate | string | null;
}

export function resolveGrantRows(rows: GrantRow[]): ResolvedGrant | null {
  if (rows.length === 0) {
    return null;
  }

  let capability: Capability = 'none';
  let allFields = false;
  const fieldSet = new Set<string>();
  let allRows = false;
  const rowPredicates: Predicate[] = [];

  for (const row of rows) {
    if (
      CAPABILITY_ORDER.indexOf(row.capability) >
      CAPABILITY_ORDER.indexOf(capability)
    ) {
      capability = row.capability;
    }
    if (row.field_mask === null) {
      allFields = true;
    } else {
      for (const field of row.field_mask) {
        fieldSet.add(field);
      }
    }
    if (row.row_predicate === null) {
      allRows = true;
    } else {
      const pred =
        typeof row.row_predicate === 'string'
          ? (JSON.parse(row.row_predicate) as Predicate)
          : row.row_predicate;
      rowPredicates.push(pred);
    }
  }

  if (capability === 'none') {
    return null;
  }

  return {
    capability,
    fieldMask: allFields ? null : [...fieldSet],
    rowPredicate: allRows
      ? null
      : rowPredicates.length === 1
        ? rowPredicates[0]!
        : { op: 'or', operands: rowPredicates },
  };
}

export async function loadResolvedGrant(
  client: PoolClient,
  principalId: string,
  collectionId: string,
): Promise<ResolvedGrant | null> {
  // Union direct grants with grants on teams this principal belongs to.
  const rows = await client.query<GrantRow>(
    `SELECT capability, field_mask, row_predicate
       FROM kitsune.grants
      WHERE collection_id = $2
        AND revoked_at IS NULL
        AND (
          principal_id = $1
          OR principal_id IN (
            SELECT t.principal_id
              FROM kitsune.team_members tm
              JOIN kitsune.teams t ON t.id = tm.team_id
             WHERE tm.principal_id = $1
          )
        )`,
    [principalId, collectionId],
  );
  return resolveGrantRows(rows.rows);
}

export function assertFieldAllowed(
  grant: ResolvedGrant | null,
  fieldName: string,
  action: 'read' | 'write' | 'propose',
): void {
  if (!grant) {
    throw new KitsuneError('Not found', 'not_found');
  }

  const required: Capability =
    action === 'read' ? 'read' : action === 'propose' ? 'propose' : 'write';

  if (
    CAPABILITY_ORDER.indexOf(grant.capability) <
    CAPABILITY_ORDER.indexOf(required)
  ) {
    if (action === 'read') {
      throw new KitsuneError('Not found', 'not_found');
    }
    throw new KitsuneError(`Field not permitted: ${fieldName}`, 'forbidden', {
      field: fieldName,
    });
  }

  if (grant.fieldMask !== null && !grant.fieldMask.includes(fieldName)) {
    if (action === 'read') {
      throw new KitsuneError(`Field not permitted: ${fieldName}`, 'forbidden', {
        field: fieldName,
      });
    }
    throw new KitsuneError(`Field not permitted: ${fieldName}`, 'forbidden', {
      field: fieldName,
    });
  }
}

export function projectFields(
  grant: ResolvedGrant | null,
  requested: string[] | undefined,
  allFields: string[],
): string[] {
  if (!grant) {
    return [];
  }
  const allowed =
    grant.fieldMask === null
      ? allFields
      : grant.fieldMask.filter((f) => allFields.includes(f));
  if (!requested || requested.length === 0) {
    return allowed;
  }
  for (const field of requested) {
    if (!allowed.includes(field)) {
      throw new KitsuneError(`Field not permitted: ${field}`, 'forbidden', {
        field,
      });
    }
  }
  return requested;
}
