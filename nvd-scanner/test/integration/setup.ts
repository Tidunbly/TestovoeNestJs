import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from 'pg';
import { ScanTargetEntity } from '../../src/modules/targets/types/entities/scan-target.entity';
import { PortScanJobEntity } from '../../src/modules/jobs/types/entities/port-scan-job.entity';
import { CveSyncJobEntity } from '../../src/modules/jobs/types/entities/cve-sync-job.entity';
import { PortEntity } from '../../src/modules/scan/types/entities/port.entity';
import { ServiceVersionEntity } from '../../src/modules/scan/types/entities/service-version.entity';
import { PortSnapshotEntity } from '../../src/modules/scan/types/entities/port-snapshot.entity';
import { CveEntity } from '../../src/modules/cve/types/entities/cve.entity';
import { NotificationEntity } from '../../src/modules/notifications/types/entities/notification.entity';
import { TargetsModule } from '../../src/modules/targets/targets.module';
import { ScanModule } from '../../src/modules/scan/scan.module';
import { JobsModule } from '../../src/modules/jobs/jobs.module';
import { CveModule } from '../../src/modules/cve/cve.module';
import { NotificationsModule } from '../../src/modules/notifications/notifications.module';
import { TargetResolverService } from '../../src/modules/targets/services/target-resolver.service';
import { TargetsService } from '../../src/modules/targets/targets.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AppController } from '../../src/app.controller';
import { ScheduleModule } from '@nestjs/schedule';

const ALL_ENTITIES = [
  ScanTargetEntity,
  PortScanJobEntity,
  CveSyncJobEntity,
  PortEntity,
  ServiceVersionEntity,
  PortSnapshotEntity,
  CveEntity,
  NotificationEntity,
];

function mockResolveToIpv4(resource: string): Promise<string | null> {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(resource)) {
    return Promise.resolve(resource);
  }
  const map: Record<string, string> = {
    'example.com': '93.184.216.34',
    'testasp.vulnweb.com': '192.168.1.100',
  };
  return Promise.resolve(map[resource] ?? null);
}

async function dropGinIndex(configService: ConfigService): Promise<void> {
  const client = new Client({
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: Number(configService.get<string>('DB_PORT', 5433)),
    user: configService.get<string>('DB_USERNAME', 'postgres'),
    password: configService.get<string>('DB_PASSWORD', 'postgres'),
    database: configService.get<string>('DB_NAME', 'scanner'),
  });
  await client.connect();
  try {
    await client.query('DROP INDEX IF EXISTS idx_cves_description_trgm');
  } finally {
    await client.end();
  }
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: ['.env.test', '.env'],
      }),
      TypeOrmModule.forRootAsync({
        inject: [ConfigService],
        useFactory: async (configService: ConfigService) => {
          await dropGinIndex(configService);
          return {
            type: 'postgres' as const,
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: Number(configService.get<string>('DB_PORT', 5433)),
            username: configService.get<string>('DB_USERNAME', 'postgres'),
            password: configService.get<string>('DB_PASSWORD', 'postgres'),
            database: configService.get<string>('DB_NAME', 'scanner'),
            entities: ALL_ENTITIES,
            synchronize: true,
          };
        },
      }),
      ScheduleModule.forRoot(),
      TargetsModule,
      ScanModule,
      JobsModule,
      CveModule,
      NotificationsModule,
    ],
    controllers: [AppController],
  })
    .overrideProvider(TargetResolverService)
    .useValue({ resolveToIpv4: jest.fn().mockImplementation(mockResolveToIpv4) })
    .overrideProvider(NotificationsService)
    .useValue({
      notifyAppStarted: jest.fn().mockResolvedValue(undefined),
      notifyCriticalCve: jest.fn().mockResolvedValue(undefined),
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  const targetsService = app.get(TargetsService);
  (targetsService as any).pingIp = jest.fn().mockResolvedValue(true);

  return app;
}

export async function clearTables(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const tables = [
    '"port_snapshots"',
    '"port_scan_jobs"',
    '"cve_sync_jobs"',
    '"notifications"',
    '"scan_targets"',
    '"ports"',
    '"service_versions"',
    '"cves"',
  ];
  for (const table of tables) {
    await dataSource.query(`DELETE FROM ${table}`);
  }
}

