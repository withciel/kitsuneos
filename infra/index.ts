import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

const config = new pulumi.Config('kitsuneos');
const domain = config.get('domain') ?? 'kitsuneos.com';
const appDomain = config.get('appDomain') ?? 'app.kitsuneos.com';
const deployApp = config.getBoolean('deployApp') ?? false;
/** AWS CloudFront+S3 for marketing site. Default on — hosting is AWS-only. */
const deploySiteCdn = config.getBoolean('deploySiteCdn') ?? true;
const stack = pulumi.getStack();

const tags = {
  Project: 'kitsuneos',
  Stack: stack,
  ManagedBy: 'pulumi',
};

// --- DNS ---
const zone = aws.route53.getZoneOutput({ name: domain });

// --- Network ---
const vpc = new aws.ec2.Vpc('kitsune-vpc', {
  cidrBlock: '10.0.0.0/16',
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { ...tags, Name: `kitsune-vpc-${stack}` },
});

const azs = aws.getAvailabilityZonesOutput({ state: 'available' });

const publicSubnetA = new aws.ec2.Subnet('public-a', {
  vpcId: vpc.id,
  cidrBlock: '10.0.1.0/24',
  availabilityZone: azs.names[0],
  mapPublicIpOnLaunch: true,
  tags: { ...tags, Name: `kitsune-public-a-${stack}` },
});
const publicSubnetB = new aws.ec2.Subnet('public-b', {
  vpcId: vpc.id,
  cidrBlock: '10.0.2.0/24',
  availabilityZone: azs.names[1],
  mapPublicIpOnLaunch: true,
  tags: { ...tags, Name: `kitsune-public-b-${stack}` },
});
const privateSubnetA = new aws.ec2.Subnet('private-a', {
  vpcId: vpc.id,
  cidrBlock: '10.0.10.0/24',
  availabilityZone: azs.names[0],
  tags: { ...tags, Name: `kitsune-private-a-${stack}` },
});
const privateSubnetB = new aws.ec2.Subnet('private-b', {
  vpcId: vpc.id,
  cidrBlock: '10.0.11.0/24',
  availabilityZone: azs.names[1],
  tags: { ...tags, Name: `kitsune-private-b-${stack}` },
});

const igw = new aws.ec2.InternetGateway('igw', { vpcId: vpc.id, tags });
const publicRouteTable = new aws.ec2.RouteTable('public-rt', {
  vpcId: vpc.id,
  routes: [{ cidrBlock: '0.0.0.0/0', gatewayId: igw.id }],
  tags,
});
new aws.ec2.RouteTableAssociation('public-a-rta', {
  subnetId: publicSubnetA.id,
  routeTableId: publicRouteTable.id,
});
new aws.ec2.RouteTableAssociation('public-b-rta', {
  subnetId: publicSubnetB.id,
  routeTableId: publicRouteTable.id,
});

const natEip = new aws.ec2.Eip('nat-eip', { domain: 'vpc', tags });
const natGateway = new aws.ec2.NatGateway('nat', {
  allocationId: natEip.id,
  subnetId: publicSubnetA.id,
  tags,
});

const privateRouteTable = new aws.ec2.RouteTable('private-rt', {
  vpcId: vpc.id,
  routes: [{ cidrBlock: '0.0.0.0/0', natGatewayId: natGateway.id }],
  tags,
});
new aws.ec2.RouteTableAssociation('private-a-rta', {
  subnetId: privateSubnetA.id,
  routeTableId: privateRouteTable.id,
});
new aws.ec2.RouteTableAssociation('private-b-rta', {
  subnetId: privateSubnetB.id,
  routeTableId: privateRouteTable.id,
});

const dbSubnetGroup = new aws.rds.SubnetGroup('db-subnets', {
  subnetIds: [privateSubnetA.id, privateSubnetB.id],
  tags,
});

const appRunnerSg = new aws.ec2.SecurityGroup('apprunner-sg', {
  vpcId: vpc.id,
  description: 'App Runner VPC connector egress',
  egress: [
    { protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] },
  ],
  tags,
});

const dbSecurityGroup = new aws.ec2.SecurityGroup('db-sg', {
  vpcId: vpc.id,
  description: 'RDS Postgres for KitsuneOS',
  ingress: [
    {
      protocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      securityGroups: [appRunnerSg.id],
    },
  ],
  egress: [
    { protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] },
  ],
  tags,
});

const dbPassword = new random.RandomPassword('db-password', {
  length: 32,
  special: false,
});

const appDbPassword = new random.RandomPassword('app-db-password', {
  length: 32,
  special: false,
});

const dbInstance = new aws.rds.Instance('kitsune-db', {
  engine: 'postgres',
  engineVersion: '16',
  instanceClass: 'db.t4g.micro',
  allocatedStorage: 20,
  dbName: 'kitsune',
  username: 'kitsune_admin',
  password: dbPassword.result,
  dbSubnetGroupName: dbSubnetGroup.name,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  publiclyAccessible: false,
  backupRetentionPeriod: 7,
  storageEncrypted: true,
  deletionProtection: stack === 'prod',
  skipFinalSnapshot: stack !== 'prod',
  tags,
});

const ownerDbUrl = pulumi.interpolate`postgresql://kitsune_admin:${dbPassword.result}@${dbInstance.address}:5432/kitsune`;
const appDbUrl = pulumi.interpolate`postgresql://kitsune_app:${appDbPassword.result}@${dbInstance.address}:5432/kitsune`;

const ownerSecret = new aws.secretsmanager.Secret('owner-db-url', { tags });
new aws.secretsmanager.SecretVersion('owner-db-url-v', {
  secretId: ownerSecret.id,
  secretString: ownerDbUrl,
});

const appSecret = new aws.secretsmanager.Secret('app-db-url', { tags });
new aws.secretsmanager.SecretVersion('app-db-url-v', {
  secretId: appSecret.id,
  secretString: appDbUrl,
});

const workosSecret = new aws.secretsmanager.Secret('workos-keys', {
  description:
    'WorkOS API key, client ID, cookie password (set manually or via deploy)',
  tags,
});
new aws.secretsmanager.SecretVersion('workos-keys-v', {
  secretId: workosSecret.id,
  secretString: JSON.stringify({
    WORKOS_API_KEY: 'REPLACE_ME',
    WORKOS_CLIENT_ID: 'REPLACE_ME',
    WORKOS_COOKIE_PASSWORD: 'REPLACE_ME',
    WORKOS_REDIRECT_URI: `https://${appDomain}/callback`,
  }),
});

const dodoSecret = new aws.secretsmanager.Secret('dodo-keys', {
  description: 'Dodo Payments API + webhook keys',
  tags,
});
new aws.secretsmanager.SecretVersion('dodo-keys-v', {
  secretId: dodoSecret.id,
  secretString: JSON.stringify({
    DODO_PAYMENTS_API_KEY: 'REPLACE_ME',
    DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
    DODO_PRODUCT_ID: 'REPLACE_ME',
    BILLING_RECONCILE_SECRET: 'REPLACE_ME',
  }),
});

const dodoWebhookSecret = new aws.secretsmanager.Secret('dodo-webhook-secret', {
  tags,
});

// Placeholder until scripts/register-dodo-webhook.mjs writes the real signing secret.
new aws.secretsmanager.SecretVersion('dodo-webhook-secret-v', {
  secretId: dodoWebhookSecret.id,
  secretString: 'pending-dodo-webhook-registration',
});

// --- ACM certificates (us-east-1) ---
const siteCert = new aws.acm.Certificate('site-cert', {
  domainName: domain,
  subjectAlternativeNames: [`www.${domain}`],
  validationMethod: 'DNS',
  tags,
});

const appCert = new aws.acm.Certificate('app-cert', {
  domainName: appDomain,
  validationMethod: 'DNS',
  tags,
});

function certValidationRecord(
  cert: aws.acm.Certificate,
  name: string,
  index: number,
): aws.route53.Record {
  const option = cert.domainValidationOptions[index];
  return new aws.route53.Record(name, {
    zoneId: zone.zoneId,
    name: option.resourceRecordName,
    type: option.resourceRecordType,
    records: [option.resourceRecordValue],
    ttl: 60,
    allowOverwrite: true,
  });
}

const siteValidation0 = certValidationRecord(siteCert, 'site-validation-0', 0);
const siteValidation1 = certValidationRecord(siteCert, 'site-validation-1', 1);

const appValidation0 = certValidationRecord(appCert, 'app-validation-0', 0);

const siteCertValidated = new aws.acm.CertificateValidation(
  'site-cert-validated',
  {
    certificateArn: siteCert.arn,
    validationRecordFqdns: [siteValidation0.fqdn, siteValidation1.fqdn],
  },
);

new aws.acm.CertificateValidation('app-cert-validated', {
  certificateArn: appCert.arn,
  validationRecordFqdns: [appValidation0.fqdn],
});

// --- Site: S3 + CloudFront + OAC (marketing site on AWS; not Cloudflare) ---
const siteBucket = deploySiteCdn
  ? new aws.s3.BucketV2('site-bucket', {
      bucket: `${stack}-kitsuneos-site`,
      tags,
    })
  : undefined;

if (siteBucket) {
  new aws.s3.BucketPublicAccessBlock('site-bucket-block', {
    bucket: siteBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });
}

const siteOac = deploySiteCdn
  ? new aws.cloudfront.OriginAccessControl('site-oac', {
      name: `kitsune-site-oac-${stack}`,
      originAccessControlOriginType: 's3',
      signingBehavior: 'always',
      signingProtocol: 'sigv4',
    })
  : undefined;

const siteDistribution =
  deploySiteCdn && siteBucket && siteOac
    ? new aws.cloudfront.Distribution('site-cdn', {
        enabled: true,
        defaultRootObject: 'index.html',
        aliases: [domain, `www.${domain}`],
        origins: [
          {
            originId: 'siteS3',
            domainName: siteBucket.bucketRegionalDomainName,
            originAccessControlId: siteOac.id,
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: 'siteS3',
          viewerProtocolPolicy: 'redirect-to-https',
          allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
          cachedMethods: ['GET', 'HEAD'],
          forwardedValues: {
            queryString: false,
            cookies: { forward: 'none' },
          },
          compress: true,
        },
        customErrorResponses: [
          {
            errorCode: 404,
            responseCode: 404,
            responsePagePath: '/404.html',
          },
        ],
        restrictions: { geoRestriction: { restrictionType: 'none' } },
        viewerCertificate: {
          acmCertificateArn: siteCertValidated.certificateArn,
          sslSupportMethod: 'sni-only',
          minimumProtocolVersion: 'TLSv1.2_2021',
        },
        tags,
      })
    : undefined;

if (siteBucket && siteDistribution) {
  new aws.s3.BucketPolicy('site-bucket-policy', {
    bucket: siteBucket.id,
    policy: pulumi
      .all([siteBucket.arn, siteDistribution.arn])
      .apply(([bucketArn, distArn]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'cloudfront.amazonaws.com' },
              Action: 's3:GetObject',
              Resource: `${bucketArn}/*`,
              Condition: {
                StringEquals: { 'AWS:SourceArn': distArn },
              },
            },
          ],
        }),
      ),
  });

  new aws.route53.Record('site-a', {
    zoneId: zone.zoneId,
    name: domain,
    type: 'A',
    aliases: [
      {
        name: siteDistribution.domainName,
        zoneId: siteDistribution.hostedZoneId,
        evaluateTargetHealth: false,
      },
    ],
  });

  new aws.route53.Record('site-www-a', {
    zoneId: zone.zoneId,
    name: `www.${domain}`,
    type: 'A',
    aliases: [
      {
        name: siteDistribution.domainName,
        zoneId: siteDistribution.hostedZoneId,
        evaluateTargetHealth: false,
      },
    ],
  });
}

// --- App: ECR + App Runner ---
const appRepo = new aws.ecr.Repository('app-repo', {
  name: `kitsuneos-app-${stack}`,
  imageScanningConfiguration: { scanOnPush: true },
  tags,
});

const vpcConnector = new aws.apprunner.VpcConnector('app-vpc-connector', {
  vpcConnectorName: `kitsune-vpc-${stack}`,
  subnets: [privateSubnetA.id, privateSubnetB.id],
  securityGroups: [appRunnerSg.id],
  tags,
});

const appRunnerRole = new aws.iam.Role('apprunner-instance-role', {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: 'tasks.apprunner.amazonaws.com',
  }),
  tags,
});

new aws.iam.RolePolicy('apprunner-secrets-policy', {
  role: appRunnerRole.id,
  policy: pulumi
    .all([
      ownerSecret.arn,
      appSecret.arn,
      workosSecret.arn,
      dodoSecret.arn,
      dodoWebhookSecret.arn,
    ])
    .apply((arns) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['secretsmanager:GetSecretValue'],
            Resource: arns,
          },
        ],
      }),
    ),
});

const appRunnerAccessRole = new aws.iam.Role('apprunner-access-role', {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: 'build.apprunner.amazonaws.com',
  }),
  tags,
});

new aws.iam.RolePolicyAttachment('apprunner-access-ecr', {
  role: appRunnerAccessRole.name,
  policyArn: aws.iam.ManagedPolicy.AmazonEC2ContainerRegistryReadOnly,
});

const appRunnerService = deployApp
  ? new aws.apprunner.Service('app-service', {
      serviceName: `kitsuneos-app-${stack}`,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerAccessRole.arn,
        },
        imageRepository: {
          imageIdentifier: pulumi.interpolate`${appRepo.repositoryUrl}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '8080',
            runtimeEnvironmentSecrets: {
              KITSUNE_OWNER_URL: ownerSecret.arn,
              KITSUNE_APP_URL: appSecret.arn,
              WORKOS_API_KEY: pulumi.interpolate`${workosSecret.arn}:WORKOS_API_KEY::`,
              WORKOS_CLIENT_ID: pulumi.interpolate`${workosSecret.arn}:WORKOS_CLIENT_ID::`,
              WORKOS_COOKIE_PASSWORD: pulumi.interpolate`${workosSecret.arn}:WORKOS_COOKIE_PASSWORD::`,
              DODO_PAYMENTS_API_KEY: pulumi.interpolate`${dodoSecret.arn}:DODO_PAYMENTS_API_KEY::`,
              DODO_PAYMENTS_ENVIRONMENT: pulumi.interpolate`${dodoSecret.arn}:DODO_PAYMENTS_ENVIRONMENT::`,
              DODO_PRODUCT_ID: pulumi.interpolate`${dodoSecret.arn}:DODO_PRODUCT_ID::`,
              BILLING_RECONCILE_SECRET: pulumi.interpolate`${dodoSecret.arn}:BILLING_RECONCILE_SECRET::`,
              DODO_PAYMENTS_WEBHOOK_KEY: dodoWebhookSecret.arn,
            },
            runtimeEnvironmentVariables: {
              NODE_ENV: 'production',
              HOSTNAME: '0.0.0.0',
              APP_BASE_URL: `https://${appDomain}`,
              WORKOS_REDIRECT_URI: `https://${appDomain}/callback`,
              // authkit-nextjs resolves redirect URI from NEXT_PUBLIC_WORKOS_REDIRECT_URI
              NEXT_PUBLIC_WORKOS_REDIRECT_URI: `https://${appDomain}/callback`,
            },
          },
        },
        autoDeploymentsEnabled: false,
      },
      instanceConfiguration: {
        cpu: '1024',
        memory: '2048',
        instanceRoleArn: appRunnerRole.arn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: 'VPC',
          vpcConnectorArn: vpcConnector.arn,
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        healthyThreshold: 1,
        unhealthyThreshold: 5,
        interval: 10,
        timeout: 5,
      },
      tags,
    })
  : undefined;

const appRunnerCustomDomain =
  deployApp && appRunnerService
    ? new aws.apprunner.CustomDomainAssociation('app-domain', {
        domainName: appDomain,
        serviceArn: appRunnerService.arn,
        enableWwwSubdomain: false,
      })
    : undefined;

if (appRunnerCustomDomain) {
  appRunnerCustomDomain.certificateValidationRecords.apply((records) =>
    records.map(
      (record, index) =>
        new aws.route53.Record(`app-domain-cert-${index}`, {
          zoneId: zone.zoneId,
          name: record.name,
          type: record.type,
          records: [record.value],
          ttl: 60,
          allowOverwrite: true,
        }),
    ),
  );

  new aws.route53.Record('app-domain-cname', {
    zoneId: zone.zoneId,
    name: appDomain,
    type: 'CNAME',
    ttl: 300,
    records: [appRunnerCustomDomain.dnsTarget],
  });
}

// --- CloudWatch alarms ---
if (appRunnerService) {
  new aws.cloudwatch.MetricAlarm('app-5xx', {
    alarmDescription: 'App Runner 5xx rate',
    metricName: '5xxStatusResponses',
    namespace: 'AWS/AppRunner',
    dimensions: { ServiceName: appRunnerService.serviceName },
    statistic: 'Sum',
    period: 300,
    evaluationPeriods: 2,
    threshold: 10,
    comparisonOperator: 'GreaterThanThreshold',
    tags,
  });
}

new aws.cloudwatch.MetricAlarm('rds-connections', {
  alarmDescription: 'RDS connection count high',
  metricName: 'DatabaseConnections',
  namespace: 'AWS/RDS',
  dimensions: { DBInstanceIdentifier: dbInstance.identifier },
  statistic: 'Average',
  period: 300,
  evaluationPeriods: 2,
  threshold: 80,
  comparisonOperator: 'GreaterThanThreshold',
  tags,
});

export const siteBucketName = siteBucket?.id ?? '';
export const siteDistributionId = siteDistribution?.id ?? '';
export const siteCertValidation = siteCert.domainValidationOptions;
export const appCertValidation = appCert.domainValidationOptions;
export const ecrRepositoryUrl = appRepo.repositoryUrl;
export const dbEndpoint = dbInstance.address;
export const ownerDbSecretArn = ownerSecret.arn;
export const appDbSecretArn = appSecret.arn;
export const vpcConnectorArn = vpcConnector.arn;
export const appRunnerServiceArn = appRunnerService?.arn ?? '';
export const appRunnerServiceUrl = appRunnerService?.serviceUrl ?? '';
export const dodoWebhookSecretArn = dodoWebhookSecret.arn;
export const domainName = domain;
export const appDomainName = appDomain;
export const appCustomDomain = appRunnerCustomDomain?.dnsTarget ?? '';
export const siteHosting = deploySiteCdn ? 'cloudfront' : 'disabled';
