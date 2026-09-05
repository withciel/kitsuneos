import { execFileSync, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

export const OWNER_URL =
  process.env.KITSUNE_OWNER_URL ??
  'postgresql://kitsune_owner:kitsune_owner@localhost:5432/kitsune';
export const APP_URL =
  process.env.KITSUNE_APP_URL ??
  'postgresql://kitsune_app:kitsune_app@localhost:5432/kitsune';

const BOOTSTRAP_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kitsune_owner') THEN
    CREATE ROLE kitsune_owner WITH LOGIN PASSWORD 'kitsune_owner' CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kitsune_app') THEN
    CREATE ROLE kitsune_app WITH LOGIN PASSWORD 'kitsune_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
`;

const CREATE_DB_SQL = `SELECT 'CREATE DATABASE kitsune OWNER kitsune_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kitsune')\\gexec`;

function installHint(): string {
  switch (platform()) {
    case 'darwin':
      return [
        '  brew install postgresql@16',
        '  brew services start postgresql@16',
      ].join('\n');
    case 'linux':
      return [
        '  sudo apt-get install -y postgresql   # Debian / Ubuntu',
        '  sudo systemctl start postgresql',
        '',
        '  sudo dnf install -y postgresql-server && sudo postgresql-setup --initdb   # Fedora / RHEL',
      ].join('\n');
    default:
      return '  See https://www.postgresql.org/download/';
  }
}

function has(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

export function requirePostgres(): void {
  if (!has('psql')) {
    console.error(
      'KitsuneOS needs a local PostgreSQL server, but `psql` was not found.\n',
    );
    console.error('Install it with:\n');
    console.error(installHint());
    console.error('\nThen run `pnpm quickstart` again.');
    process.exit(1);
  }

  const ready = spawnSync('pg_isready', ['-q'], { stdio: 'ignore' });
  if (ready.status !== 0) {
    console.error(
      'PostgreSQL is installed but not accepting connections on localhost:5432.\n',
    );
    console.error('Start it with:\n');
    console.error(installHint());
    console.error('\nThen run `pnpm quickstart` again.');
    process.exit(1);
  }
}

interface SuperuserRoute {
  describe: string;
  run: (sql: string) => void;
}

/**
 * Creating roles needs a superuser connection, and how you get one differs by
 * install. Homebrew makes the current user a superuser; Debian and friends put
 * it behind the `postgres` system account. Try both before giving up.
 */
function superuserRoutes(): SuperuserRoute[] {
  const routes: SuperuserRoute[] = [
    {
      describe: 'psql -d postgres (current user)',
      run: (sql) =>
        execFileSync(
          'psql',
          ['-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-f', '-'],
          {
            input: sql,
            stdio: ['pipe', 'ignore', 'pipe'],
          },
        ),
    },
    {
      describe: 'psql -U postgres -d postgres',
      run: (sql) =>
        execFileSync(
          'psql',
          [
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-f',
            '-',
          ],
          { input: sql, stdio: ['pipe', 'ignore', 'pipe'] },
        ),
    },
  ];

  if (platform() !== 'win32') {
    routes.push({
      describe: 'sudo -u postgres psql',
      run: (sql) =>
        execFileSync(
          'sudo',
          [
            '-n',
            '-u',
            'postgres',
            'psql',
            '-v',
            'ON_ERROR_STOP=1',
            '-d',
            'postgres',
            '-f',
            '-',
          ],
          { input: sql, stdio: ['pipe', 'ignore', 'pipe'] },
        ),
    });
  }

  return routes;
}

function rolesAndDatabaseReady(): boolean {
  return (
    spawnSync('psql', [OWNER_URL, '-c', 'SELECT 1'], { stdio: 'ignore' })
      .status === 0 &&
    spawnSync('psql', [APP_URL, '-c', 'SELECT 1'], { stdio: 'ignore' })
      .status === 0
  );
}


export function ensureVectorExtension(): void {
  // pgvector is required for embeddings (ADR-004). Prefer a pgvector image
  // (pgvector/pgvector:pg16) or install the extension package on the host.
  const sql = 'CREATE EXTENSION IF NOT EXISTS vector;';
  try {
    execFileSync(
      'psql',
      [OWNER_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { stdio: ['ignore', 'ignore', 'pipe'], env: process.env },
    );
  } catch (error) {
    const detail =
      error instanceof Error && 'stderr' in error
        ? String((error as { stderr?: Buffer }).stderr ?? '')
        : '';
    console.error(
      'Could not create the pgvector extension in database `kitsune`.',
    );
    console.error(
      'Use the pgvector/pgvector:pg16 image (docker compose) or install pgvector.',
    );
    if (detail.trim()) console.error(detail.trim());
    process.exit(1);
  }
}

export function ensureRolesAndDatabase(): 'created' | 'already-present' {
  if (rolesAndDatabaseReady()) {
    return 'already-present';
  }

  const failures: string[] = [];
  for (const route of superuserRoutes()) {
    try {
      route.run(BOOTSTRAP_SQL);
      route.run(CREATE_DB_SQL);
      if (rolesAndDatabaseReady()) {
        return 'created';
      }
      failures.push(`${route.describe}: ran but roles still unreachable`);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message.split('\n')[0] : String(error);
      failures.push(`${route.describe}: ${detail}`);
    }
  }

  console.error(
    'Could not create the KitsuneOS roles and database automatically.\n',
  );
  console.error('Tried:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    '\nRun this yourself as a Postgres superuser, then re-run `pnpm quickstart`:\n',
  );
  console.error(BOOTSTRAP_SQL.trim());
  console.error('\n  CREATE DATABASE kitsune OWNER kitsune_owner;');
  process.exit(1);
}
