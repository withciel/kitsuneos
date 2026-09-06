import type { Pool } from 'pg';
import { KitsuneError } from '../types.js';
import {
  loadWorkspaceSubscriptionStatus,
  type SubscriptionStatus,
} from './entitlement.js';

export type PlanId = 'free' | 'pro';

export type PlanLimitDimension =
  | 'workspacesPerUser'
  | 'agentsPerWorkspace'
  | 'membersPerWorkspace'
  | 'collectionsPerWorkspace'
  | 'storageBytesPerWorkspace'
  | 'mcpOpsPerDay';

export interface PlanLimits {
  workspacesPerUser: number;
  agentsPerWorkspace: number;
  membersPerWorkspace: number;
  collectionsPerWorkspace: number;
  storageBytesPerWorkspace: number;
  mcpOpsPerDay: number;
}

/** Open free tier — WorkOS AuthKit signup is open; these caps keep free sustainable. */
export const FREE_PLAN_LIMITS: PlanLimits = {
  workspacesPerUser: 1,
  agentsPerWorkspace: 5,
  membersPerWorkspace: 5,
  collectionsPerWorkspace: 15,
  storageBytesPerWorkspace: 100 * 1024 * 1024,
  mcpOpsPerDay: 250,
};

/** Paid via Dodo Payments — higher caps, still bounded. */
export const PRO_PLAN_LIMITS: PlanLimits = {
  workspacesPerUser: 20,
  agentsPerWorkspace: 50,
  membersPerWorkspace: 100,
  collectionsPerWorkspace: 200,
  storageBytesPerWorkspace: 10 * 1024 * 1024 * 1024,
  mcpOpsPerDay: 50_000,
};

const PAID_STATUSES = new Set<SubscriptionStatus>(['active', 'on_hold']);

export function planIdFromSubscriptionStatus(
  status: SubscriptionStatus | null | undefined,
): PlanId {
  if (status && PAID_STATUSES.has(status)) {
    return 'pro';
  }
  return 'free';
}

export function limitsForPlan(plan: PlanId): PlanLimits {
  return plan === 'pro' ? PRO_PLAN_LIMITS : FREE_PLAN_LIMITS;
}

export async function loadWorkspacePlan(
  pool: Pool,
  workspaceId: string,
): Promise<PlanId> {
  const status = await loadWorkspaceSubscriptionStatus(pool, workspaceId);
  return planIdFromSubscriptionStatus(status);
}

export async function userHasPaidWorkspace(
  pool: Pool,
  userId: string,
): Promise<boolean> {
  const result = await pool.query<{ status: SubscriptionStatus }>(
    `SELECT s.status
       FROM kitsune.workspace_memberships m
       JOIN kitsune.subscriptions s ON s.workspace_id = m.workspace_id
      WHERE m.user_id = $1
      ORDER BY s.created_at DESC`,
    [userId],
  );
  return result.rows.some((row) => PAID_STATUSES.has(row.status));
}

export interface PlanUsageSnapshot {
  plan: PlanId;
  limits: PlanLimits;
  usage: {
    workspacesPerUser: number | null;
    agentsPerWorkspace: number;
    membersPerWorkspace: number;
    collectionsPerWorkspace: number;
    storageBytesPerWorkspace: number;
    mcpOpsPerDay: number;
  };
}

async function countAgents(pool: Pool, workspaceId: string): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM kitsune.principals
      WHERE workspace_id = $1 AND kind = 'agent' AND disabled_at IS NULL`,
    [workspaceId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function countMembers(pool: Pool, workspaceId: string): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM kitsune.workspace_memberships
      WHERE workspace_id = $1`,
    [workspaceId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function countCollections(
  pool: Pool,
  workspaceId: string,
): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM kitsune.collections
      WHERE workspace_id = $1`,
    [workspaceId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function sumStorageBytes(
  pool: Pool,
  workspaceId: string,
): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT coalesce(sum(byte_size), 0)::text AS n
       FROM kitsune.attachments
      WHERE workspace_id = $1`,
    [workspaceId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function countMcpOpsToday(
  pool: Pool,
  workspaceId: string,
): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT coalesce(sum(count), 0)::text AS n
       FROM kitsune.usage_events
      WHERE workspace_id = $1
        AND at >= date_trunc('day', now())`,
    [workspaceId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function countUserWorkspaces(
  pool: Pool,
  userId: string,
): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM kitsune.workspace_memberships
      WHERE user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

function limitExceededMessage(
  dimension: PlanLimitDimension,
  limit: number,
  upgradeHint: string,
): string {
  const labels: Record<PlanLimitDimension, string> = {
    workspacesPerUser: 'workspaces',
    agentsPerWorkspace: 'agents',
    membersPerWorkspace: 'people',
    collectionsPerWorkspace: 'databases',
    storageBytesPerWorkspace: 'attachment storage',
    mcpOpsPerDay: 'agent / MCP operations today',
  };
  return `Free plan limit reached for ${labels[dimension]} (${limit}). ${upgradeHint}`;
}

export async function loadPlanUsage(
  pool: Pool,
  workspaceId: string,
  userId?: string | null,
): Promise<PlanUsageSnapshot> {
  const plan = await loadWorkspacePlan(pool, workspaceId);
  const limits = limitsForPlan(plan);
  const [
    agentsPerWorkspace,
    membersPerWorkspace,
    collectionsPerWorkspace,
    storageBytesPerWorkspace,
    mcpOpsPerDay,
    workspacesPerUser,
  ] = await Promise.all([
    countAgents(pool, workspaceId),
    countMembers(pool, workspaceId),
    countCollections(pool, workspaceId),
    sumStorageBytes(pool, workspaceId),
    countMcpOpsToday(pool, workspaceId),
    userId ? countUserWorkspaces(pool, userId) : Promise.resolve(null),
  ]);
  return {
    plan,
    limits,
    usage: {
      workspacesPerUser,
      agentsPerWorkspace,
      membersPerWorkspace,
      collectionsPerWorkspace,
      storageBytesPerWorkspace,
      mcpOpsPerDay,
    },
  };
}

export async function assertPlanLimit(
  pool: Pool,
  input: {
    workspaceId?: string;
    dimension: PlanLimitDimension;
    /** Upcoming increment (default 1). For storage, pass bytes about to add. */
    delta?: number;
    userId?: string;
    upgradePath?: string;
  },
): Promise<void> {
  const delta = input.delta ?? 1;
  const upgradePath = input.upgradePath ?? '/settings/billing';
  const upgradeHint = `Upgrade to Pro: ${upgradePath}`;

  let plan: PlanId;
  if (input.dimension === 'workspacesPerUser') {
    if (!input.userId) {
      throw new KitsuneError(
        'userId is required for workspacesPerUser limit',
        'internal',
      );
    }
    plan = (await userHasPaidWorkspace(pool, input.userId)) ? 'pro' : 'free';
  } else {
    if (!input.workspaceId) {
      throw new KitsuneError(
        'workspaceId is required for this plan limit',
        'internal',
      );
    }
    plan = await loadWorkspacePlan(pool, input.workspaceId);
  }

  const limits = limitsForPlan(plan);
  const limit = limits[input.dimension];
  const workspaceId = input.workspaceId;

  let current = 0;
  switch (input.dimension) {
    case 'workspacesPerUser':
      current = await countUserWorkspaces(pool, input.userId!);
      break;
    case 'agentsPerWorkspace':
      current = await countAgents(pool, workspaceId!);
      break;
    case 'membersPerWorkspace':
      current = await countMembers(pool, workspaceId!);
      break;
    case 'collectionsPerWorkspace':
      current = await countCollections(pool, workspaceId!);
      break;
    case 'storageBytesPerWorkspace':
      current = await sumStorageBytes(pool, workspaceId!);
      break;
    case 'mcpOpsPerDay':
      current = await countMcpOpsToday(pool, workspaceId!);
      break;
    default: {
      const _exhaustive: never = input.dimension;
      throw new KitsuneError(
        `Unknown plan dimension: ${_exhaustive}`,
        'internal',
      );
    }
  }

  if (current + delta > limit) {
    throw new KitsuneError(
      limitExceededMessage(input.dimension, limit, upgradeHint),
      'forbidden',
      {
        plan,
        dimension: input.dimension,
        limit,
        usage: current,
        upgradePath,
      },
    );
  }
}
