import type { PoolClient } from 'pg';
import { KitsuneError } from '../types.js';

export type AutomationPolicyKind = 'auto_apply' | 'min_approvals';

export interface AutoApplyPolicyConfig {
  /** Field names that may appear on ops (union across collections). */
  allowedFields: string[];
  /** Optional collection allowlist; omit to allow any collection. */
  collections?: string[];
  /** Minimum change-set confidence in [0, 1]. */
  minConfidence?: number;
}

export interface MinApprovalsPolicyConfig {
  minApprovals: number;
  collections?: string[];
  fields?: string[];
}

export type AutomationPolicyConfig =
  | AutoApplyPolicyConfig
  | MinApprovalsPolicyConfig;

export interface AutomationPolicy {
  id: string;
  workspaceId: string;
  name: string;
  enabled: boolean;
  kind: AutomationPolicyKind;
  config: AutomationPolicyConfig;
}

export interface ChangeOpSummary {
  collectionName: string;
  fieldName: string | null;
  op: string;
}

export function assertAutoApplyConfig(config: AutoApplyPolicyConfig): void {
  if (
    !Array.isArray(config.allowedFields) ||
    config.allowedFields.length === 0
  ) {
    throw new KitsuneError('auto_apply requires allowedFields', 'validation');
  }
  if (
    config.minConfidence !== undefined &&
    (typeof config.minConfidence !== 'number' ||
      config.minConfidence < 0 ||
      config.minConfidence > 1)
  ) {
    throw new KitsuneError(
      'minConfidence must be between 0 and 1',
      'validation',
    );
  }
}

export function assertMinApprovalsConfig(
  config: MinApprovalsPolicyConfig,
): void {
  if (!Number.isInteger(config.minApprovals) || config.minApprovals < 2) {
    throw new KitsuneError(
      'minApprovals must be an integer >= 2',
      'validation',
    );
  }
}

export function matchesAutoApply(
  config: AutoApplyPolicyConfig,
  ops: ChangeOpSummary[],
  confidence: number | null,
): boolean {
  if (ops.length === 0) return false;
  if (
    config.minConfidence !== undefined &&
    (confidence === null || confidence < config.minConfidence)
  ) {
    return false;
  }
  const collections = config.collections ? new Set(config.collections) : null;
  const allowed = new Set(config.allowedFields);
  for (const op of ops) {
    if (collections && !collections.has(op.collectionName)) {
      return false;
    }
    if (op.op === 'delete') {
      return false;
    }
    if (!op.fieldName || !allowed.has(op.fieldName)) {
      return false;
    }
  }
  return true;
}

export function matchesMinApprovalsScope(
  config: MinApprovalsPolicyConfig,
  ops: ChangeOpSummary[],
): boolean {
  if (ops.length === 0) return false;
  const collections = config.collections ? new Set(config.collections) : null;
  const fields = config.fields ? new Set(config.fields) : null;
  for (const op of ops) {
    if (collections && !collections.has(op.collectionName)) {
      return false;
    }
    if (fields && op.fieldName && !fields.has(op.fieldName)) {
      return false;
    }
    if (fields && !op.fieldName) {
      return false;
    }
  }
  return true;
}

export async function listEnabledPolicies(
  client: PoolClient,
  workspaceId: string,
): Promise<AutomationPolicy[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    enabled: boolean;
    kind: AutomationPolicyKind;
    config: AutomationPolicyConfig;
  }>(
    `SELECT id, workspace_id, name, enabled, kind, config
       FROM kitsune.automation_policies
      WHERE workspace_id = $1 AND enabled = true
      ORDER BY name`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    enabled: row.enabled,
    kind: row.kind,
    config: row.config,
  }));
}
