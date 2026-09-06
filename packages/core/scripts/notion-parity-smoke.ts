import {
  canViewPage,
  createOAuthApp,
  createPools,
  getPageAccess,
  issueOAuthClientCredentialsToken,
  resolveOAuthAccessToken,
  sharePageWithPrincipal,
  upsertPageVisibility,
} from '../src/index.ts';

const ownerUrl =
  process.env.KITSUNE_OWNER_URL ??
  'postgresql://kitsune_owner:kitsune_owner@localhost:5432/kitsune';
const appUrl =
  process.env.KITSUNE_APP_URL ??
  'postgresql://kitsune_app:kitsune_app@localhost:5432/kitsune';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const { ownerPool } = createPools({ ownerUrl, appUrl });
  try {
    const ws = await ownerPool.query<{ id: string }>(
      `SELECT w.id
         FROM kitsune.workspaces w
         JOIN kitsune.principals p ON p.workspace_id = w.id
        WHERE w.slug <> '_system'
          AND p.kind = 'human'
          AND p.disabled_at IS NULL
        GROUP BY w.id
        HAVING count(*) >= 1
        ORDER BY w.created_at ASC
        LIMIT 1`,
    );
    assert(ws.rows[0], 'need a workspace');
    const workspaceId = ws.rows[0].id;

    const humans = await ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.principals
        WHERE workspace_id = $1 AND kind = 'human' AND disabled_at IS NULL
        ORDER BY display_name ASC LIMIT 2`,
      [workspaceId],
    );
    assert(humans.rows[0], 'need a human principal');
    const ownerId = humans.rows[0].id;
    const otherId = humans.rows[1]?.id;

    const coll = await ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.collections WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId],
    );
    assert(coll.rows[0], 'need a collection');
    const collectionId = coll.rows[0].id;
    const recordId = crypto.randomUUID();

    await upsertPageVisibility(ownerPool, {
      workspaceId,
      collectionId,
      recordId,
      visibility: 'private',
      ownerPrincipalId: ownerId,
      actorPrincipalId: ownerId,
    });

    assert(
      await canViewPage(ownerPool, {
        workspaceId,
        collectionId,
        recordId,
        principalId: ownerId,
      }),
      'owner should see private page',
    );

    if (otherId) {
      assert(
        !(await canViewPage(ownerPool, {
          workspaceId,
          collectionId,
          recordId,
          principalId: otherId,
        })),
        'other human should not see private page',
      );

      await sharePageWithPrincipal(ownerPool, {
        workspaceId,
        collectionId,
        recordId,
        granteePrincipalId: otherId,
        capability: 'read',
        actorPrincipalId: ownerId,
      });

      assert(
        await canViewPage(ownerPool, {
          workspaceId,
          collectionId,
          recordId,
          principalId: otherId,
        }),
        'shared principal should see page',
      );

      const access = await getPageAccess(ownerPool, {
        workspaceId,
        collectionId,
        recordId,
      });
      assert(
        access?.visibility === 'shared',
        'visibility should become shared',
      );
      assert(
        access.shares.some((share) => share.principalId === otherId),
        'share row present',
      );
    }

    const service = await ownerPool.query<{ id: string }>(
      `INSERT INTO kitsune.principals (id, workspace_id, kind, display_name)
       VALUES ($1, $2, 'service', 'smoke-oauth-app')
       RETURNING id`,
      [crypto.randomUUID(), workspaceId],
    );
    const serviceId = service.rows[0]!.id;

    const created = await createOAuthApp(ownerPool, {
      workspaceId,
      name: `Smoke App ${Date.now()}`,
      principalId: serviceId,
      createdBy: ownerId,
    });
    assert(created.clientSecret.length > 10, 'client secret issued');

    const token = await issueOAuthClientCredentialsToken(ownerPool, {
      clientId: created.app.clientId,
      clientSecret: created.clientSecret,
    });
    assert(token.accessToken.length > 10, 'access token issued');

    const resolved = await resolveOAuthAccessToken(
      ownerPool,
      token.accessToken,
    );
    assert(resolved?.workspaceId === workspaceId, 'token resolves workspace');
    assert(resolved?.principalId === serviceId, 'token resolves principal');
    assert(
      resolved?.scopes.includes('databases:create'),
      'databases:create scope present',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          privateAcl: true,
          sharedAcl: Boolean(otherId),
          oauthToken: true,
          scopes: resolved?.scopes,
        },
        null,
        2,
      ),
    );
  } finally {
    await ownerPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
