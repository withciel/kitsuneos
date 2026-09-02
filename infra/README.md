# KitsuneOS AWS Infrastructure (Pulumi)

Stack: `staging` or `prod` in **us-east-1**.

## Resources

- VPC with public/private subnets
- RDS Postgres 16 (private, backups + PITR via `backupRetentionPeriod`)
- Secrets Manager: owner and app database URLs (generated credentials)
- ACM certificates: `kitsuneos.com` + `app.kitsuneos.com` (both us-east-1)
- S3 + CloudFront + OAC for static site
- ECR repository for `apps/app` container
- App Runner VPC connector
- CloudWatch alarms (5xx, RDS connections)

## Prerequisites

- AWS credentials configured
- Pulumi CLI installed
- Route 53 hosted zone for `kitsuneos.com` (add validation CNAMEs from cert outputs)

## Commands

```bash
cd infra
npm install          # Pulumi Node.js runtime deps (required once)
pulumi stack select kitsuneos   # or: pulumi stack init kitsuneos
pulumi config set kitsuneos:domain kitsuneos.com
pulumi config set kitsuneos:appDomain app.kitsuneos.com
source ../scripts/aws-env.sh    # if you use `aws login`
pulumi up
```

## WorkOS secrets

After `pulumi up`, set real values in the `workos-keys` Secrets Manager secret:

- `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`
- `WORKOS_REDIRECT_URI` defaults to `https://app.kitsuneos.com/callback`

Wire these into App Runner runtime (extend `imageConfiguration.runtimeEnvironmentSecrets` in `infra/index.ts` or set via console).

## Deploy site (after `pulumi up`)

```bash
source scripts/aws-env.sh
./scripts/deploy-site.sh
./scripts/deploy-app.sh
```

## Backup restore drill

1. Create manual snapshot: `aws rds create-db-snapshot --db-instance-identifier <id> --db-snapshot-identifier kitsune-restore-test`
2. Restore to new instance from snapshot
3. Point acceptance tests at restored endpoint via env vars
4. Run `pnpm acceptance`
5. Document date and snapshot id below

### Restore log

| Date | Snapshot ID | Result |
|------|-------------|--------|
| (pending first deploy) | | |

## Post-deploy: Dodo webhook registration

`scripts/deploy-app.sh` registers the Dodo webhook after App Runner is live and writes the secret to Secrets Manager.
