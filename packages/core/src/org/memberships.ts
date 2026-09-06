import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  TeamSummary,
  WorkspaceMembership,
  WorkspaceRole,
} from '../types.js';
import { KitsuneError } from '../types.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listMembershipsForUser(
  pool: Pool,
  userId: string,
): Promise<WorkspaceMembership[]> {
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    workspace_name: string;
    principal_id: string;
    user_id: string | null;
    email: string;
    role: WorkspaceRole;
  }>(
    `SELECT m.id, m.workspace_id,
            COALESCE(w.name, w.slug) AS workspace_name,
            m.principal_id, m.user_id, m.email, m.role
       FROM kitsune.workspace_memberships m
       JOIN kitsune.workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1
      ORDER BY workspace_name ASC`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    principalId: row.principal_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
  }));
}

export async function listMembershipsForWorkspace(
  pool: Pool,
  workspaceId: string,
): Promise<WorkspaceMembership[]> {
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    workspace_name: string;
    principal_id: string;
    user_id: string | null;
    email: string;
    role: WorkspaceRole;
  }>(
    `SELECT m.id, m.workspace_id,
            COALESCE(w.name, w.slug) AS workspace_name,
            m.principal_id, m.user_id, m.email, m.role
       FROM kitsune.workspace_memberships m
       JOIN kitsune.workspaces w ON w.id = m.workspace_id
      WHERE m.workspace_id = $1
      ORDER BY m.role ASC, m.email ASC`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    principalId: row.principal_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
  }));
}

export async function ensureOwnerMembership(
  pool: Pool,
  input: {
    userId: string;
    workspaceId: string;
    principalId: string;
    email: string;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO kitsune.workspace_memberships
       (id, workspace_id, principal_id, user_id, email, role)
     VALUES ($1, $2, $3, $4, $5, 'owner')
     ON CONFLICT (workspace_id, email) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           principal_id = EXCLUDED.principal_id`,
    [
      randomUUID(),
      input.workspaceId,
      input.principalId,
      input.userId,
      normalizeEmail(input.email),
    ],
  );
}

export async function claimInvitesForUser(
  pool: Pool,
  input: { userId: string; email: string },
): Promise<number> {
  const result = await pool.query(
    `UPDATE kitsune.workspace_memberships
        SET user_id = $1
      WHERE lower(email) = $2
        AND user_id IS NULL`,
    [input.userId, normalizeEmail(input.email)],
  );
  return result.rowCount ?? 0;
}

export async function inviteWorkspaceMember(
  pool: Pool,
  input: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    principalId: string;
    actorUserId: string;
  },
): Promise<{ membershipId: string; principalId: string }> {
  if (input.role === 'owner') {
    throw new KitsuneError(
      'Cannot invite another owner this way',
      'validation',
    );
  }
  const email = normalizeEmail(input.email);
  if (!email.includes('@')) {
    throw new KitsuneError('Enter a valid email address', 'validation');
  }

  const actor = await pool.query<{ role: WorkspaceRole }>(
    `SELECT role FROM kitsune.workspace_memberships
      WHERE workspace_id = $1 AND user_id = $2`,
    [input.workspaceId, input.actorUserId],
  );
  const actorRole = actor.rows[0]?.role;
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    throw new KitsuneError('Only admins can invite people', 'forbidden');
  }

  const existingUser = await pool.query<{ id: string }>(
    `SELECT id FROM kitsune.users WHERE lower(email) = $1`,
    [email],
  );
  const membershipId = randomUUID();
  await pool.query(
    `INSERT INTO kitsune.workspace_memberships
       (id, workspace_id, principal_id, user_id, email, role)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      membershipId,
      input.workspaceId,
      input.principalId,
      existingUser.rows[0]?.id ?? null,
      email,
      input.role,
    ],
  );
  return { membershipId, principalId: input.principalId };
}

export async function createTeamRow(
  pool: Pool,
  input: {
    workspaceId: string;
    name: string;
    principalId: string;
  },
): Promise<TeamSummary> {
  const name = input.name.trim();
  if (!name) {
    throw new KitsuneError('Team name is required', 'validation');
  }
  const id = randomUUID();
  await pool.query(
    `INSERT INTO kitsune.teams (id, workspace_id, name, principal_id)
     VALUES ($1, $2, $3, $4)`,
    [id, input.workspaceId, name, input.principalId],
  );
  return {
    id,
    workspaceId: input.workspaceId,
    name,
    principalId: input.principalId,
    memberPrincipalIds: [],
  };
}

export async function listTeams(
  pool: Pool,
  workspaceId: string,
): Promise<TeamSummary[]> {
  const teams = await pool.query<{
    id: string;
    workspace_id: string;
    name: string;
    principal_id: string;
  }>(
    `SELECT id, workspace_id, name, principal_id
       FROM kitsune.teams
      WHERE workspace_id = $1
      ORDER BY name ASC`,
    [workspaceId],
  );
  const members = await pool.query<{
    team_id: string;
    principal_id: string;
  }>(
    `SELECT tm.team_id, tm.principal_id
       FROM kitsune.team_members tm
       JOIN kitsune.teams t ON t.id = tm.team_id
      WHERE t.workspace_id = $1`,
    [workspaceId],
  );
  const byTeam = new Map<string, string[]>();
  for (const row of members.rows) {
    const list = byTeam.get(row.team_id) ?? [];
    list.push(row.principal_id);
    byTeam.set(row.team_id, list);
  }
  return teams.rows.map((team) => ({
    id: team.id,
    workspaceId: team.workspace_id,
    name: team.name,
    principalId: team.principal_id,
    memberPrincipalIds: byTeam.get(team.id) ?? [],
  }));
}

export async function addTeamMember(
  pool: Pool,
  input: { teamId: string; principalId: string; workspaceId: string },
): Promise<void> {
  const team = await pool.query<{ id: string }>(
    `SELECT id FROM kitsune.teams WHERE id = $1 AND workspace_id = $2`,
    [input.teamId, input.workspaceId],
  );
  if (!team.rows[0]) {
    throw new KitsuneError('Team not found', 'not_found');
  }
  const person = await pool.query<{ id: string }>(
    `SELECT id FROM kitsune.principals
      WHERE id = $1 AND workspace_id = $2 AND kind = 'human'
        AND disabled_at IS NULL`,
    [input.principalId, input.workspaceId],
  );
  if (!person.rows[0]) {
    throw new KitsuneError('Person not found in this workspace', 'not_found');
  }
  await pool.query(
    `INSERT INTO kitsune.team_members (team_id, principal_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [input.teamId, input.principalId],
  );
}

export async function removeTeamMember(
  pool: Pool,
  input: { teamId: string; principalId: string; workspaceId: string },
): Promise<void> {
  await pool.query(
    `DELETE FROM kitsune.team_members tm
      USING kitsune.teams t
      WHERE tm.team_id = t.id
        AND t.id = $1
        AND t.workspace_id = $2
        AND tm.principal_id = $3`,
    [input.teamId, input.workspaceId, input.principalId],
  );
}
