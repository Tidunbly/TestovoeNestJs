import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanTargetEntity } from './modules/targets/types/entities/scan-target.entity';
import { TargetsModule } from './modules/targets/targets.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ScanModule } from './modules/scan/scan.module';
import { PortScanJobEntity } from './modules/jobs/types/entities/port-scan-job.entity';
import { CveSyncJobEntity } from './modules/jobs/types/entities/cve-sync-job.entity';
import { PortEntity } from './modules/scan/types/entities/port.entity';
import { ServiceVersionEntity } from './modules/scan/types/entities/service-version.entity';
import { PortSnapshotEntity } from './modules/scan/types/entities/port-snapshot.entity';
import { CveEntity } from './modules/cve/types/entities/cve.entity';
import { Client } from 'pg';
import { AppController } from './app.controller';

async function ensureDatabaseExists(
  configService: ConfigService,
): Promise<void> {
  const host = configService.get<string>('DB_HOST', 'localhost');
  const port = Number(configService.get<string>('DB_PORT', '5432'));
  const username = configService.get<string>('DB_USERNAME', 'postgres');
  const password = configService.get<string>('DB_PASSWORD', 'postgres');
  const targetDatabase = configService.get<string>('DB_NAME', 'scanner');

  const adminClient = new Client({
    host,
    port,
    user: username,
    password,
    database: 'postgres',
  });

  await adminClient.connect();
  try {
    const existing = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase],
    );
    if (!existing.rowCount) {
      const escapedDbName = `"${targetDatabase.replace(/"/g, '""')}"`;
      await adminClient.query(`CREATE DATABASE ${escapedDbName}`);
    }
  } finally {
    await adminClient.end();
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        await ensureDatabaseExists(configService);

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: Number(configService.get<string>('DB_PORT', '5432')),
          username: configService.get<string>('DB_USERNAME', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', 'postgres'),
          database: configService.get<string>('DB_NAME', 'scanner'),
          entities: [
            ScanTargetEntity,
            PortScanJobEntity,
            CveSyncJobEntity,
            PortEntity,
            ServiceVersionEntity,
            PortSnapshotEntity,
            CveEntity,
          ],
          synchronize: configService.get<string>('DB_SYNC', 'true') === 'true',
        };
      },
    }),
    ScheduleModule.forRoot(),
    TargetsModule,
    ScanModule,
    JobsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
