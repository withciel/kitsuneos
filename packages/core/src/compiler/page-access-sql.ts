import type { PoolClient } from 'pg';

/**
 * Compile page_access / page_shares into a parameterized WHERE fragment.
 * Missing page_access row ⇒ workspace visibility (visible).
 * Workspace admins and owners always see the page.
 */
export async function compilePageAccessPredicate(
  client: PoolClient,
  input: {
    workspaceId: string;
    collectionId: string;
    principalId: string;
    rootAlias: string;
    paramStart: number;
  },
): Promise<{ sql: string; params: unknown[]; nextParam: number }> {
  const effective = await client.query<{ id: string }>(
    `SELECT $1::uuid AS id
     UNION
     SELECT t.principal_id AS id
       FROM kitsune.team_members tm
       JOIN kitsune.teams t ON t.id = tm.team_id
      WHERE t.workspace_id = $2
        AND tm.principal_id = $1`,
    [input.principalId, input.workspaceId],
  );
  const effectiveIds = effective.rows.map((row) => row.id);
  let paramIdx = input.paramStart;
  const wsParam = paramIdx++;
  const colParam = paramIdx++;
  const principalParam = paramIdx++;
  const idsParam = paramIdx++;

  const alias = input.rootAlias;
  const sql = `(
    NOT EXISTS (
      SELECT 1 FROM kitsune.page_access pa
       WHERE pa.workspace_id = $${wsParam}::uuid
         AND pa.collection_id = $${colParam}::uuid
         AND pa.record_id = ${alias}.id
    )
    OR EXISTS (
      SELECT 1 FROM kitsune.page_access pa
       WHERE pa.workspace_id = $${wsParam}::uuid
         AND pa.collection_id = $${colParam}::uuid
         AND pa.record_id = ${alias}.id
         AND (
           pa.visibility = 'workspace'
           OR pa.owner_principal_id = $${principalParam}::uuid
           OR EXISTS (
             SELECT 1 FROM kitsune.workspace_memberships m
              WHERE m.workspace_id = $${wsParam}::uuid
                AND m.principal_id = $${principalParam}::uuid
                AND m.role IN ('owner', 'admin')
           )
           OR (
             pa.visibility = 'shared'
             AND EXISTS (
               SELECT 1 FROM kitsune.page_shares ps
                WHERE ps.workspace_id = $${wsParam}::uuid
                  AND ps.collection_id = $${colParam}::uuid
                  AND ps.record_id = ${alias}.id
                  AND ps.grantee_principal_id = ANY($${idsParam}::uuid[])
             )
           )
         )
    )
  )`;

  return {
    sql,
    params: [
      input.workspaceId,
      input.collectionId,
      input.principalId,
      effectiveIds,
    ],
    nextParam: paramIdx,
  };
}
