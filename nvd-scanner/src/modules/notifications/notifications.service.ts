import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationRepository } from './repositories/notification.repository';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class NotificationsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly threshold: number;
  private readonly recipientEmail: string;
  private transporter: Transporter | null = null;

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly configService: ConfigService,
  ) {
    this.threshold = Number(this.configService.get<string>('CVE_NOTIFY_THRESHOLD', '7'));
    this.recipientEmail = this.configService.get<string>('SMTP_TO_EMAIL', '');
  }

  onModuleInit(): void {
    const host = this.configService.get<string>('SMTP_HOST', '');
    const port = Number(this.configService.get<string>('SMTP_PORT', '587'));
    const user = this.configService.get<string>('SMTP_USER', '');
    const pass = this.configService.get<string>('SMTP_PASS', '');

    if (!host || !user) {
      this.logger.warn('SMTP not configured, email notifications disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    this.logger.log(`SMTP transport configured: ${host}:${port}`);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.notifyAppStarted();
  }

  async notifyAppStarted(): Promise<void> {
    if (!this.transporter || !this.recipientEmail) {
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM_EMAIL', this.configService.get<string>('SMTP_USER', '')),
        to: this.recipientEmail,
        subject: '[NVD Scanner] Application Started',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#28a745;">NVD Scanner Started</h2>
            <p>The application has been started successfully at ${new Date().toISOString()}.</p>
            <p style="color:#999;font-size:12px;">NVD Scanner — automated notification</p>
          </div>
        `.trim(),
      });
      this.logger.log('Startup notification email sent');
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unknown send error';
      this.logger.error(`Failed to send startup notification: ${errMessage}`);
    }
  }

  async notifyCriticalCve(data: {
    cveId: string;
    cvssV3: number | null;
    hostIp: string;
    port: number | null;
    version: string | null;
    description: string;
  }): Promise<void> {
    if (data.cvssV3 !== null && data.cvssV3 < this.threshold) {
      return;
    }

    const entity = await this.notificationRepository.create(data);

    if (!this.transporter || !this.recipientEmail) {
      this.logger.warn(
        `Email not configured, notification ${entity.id} saved but not sent`,
      );
      return;
    }

    try {
      const { subject, html } = this.formatEmail(data);
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM_EMAIL', this.configService.get<string>('SMTP_USER', '')),
        to: this.recipientEmail,
        subject,
        html,
      });
      await this.notificationRepository.markSent(entity.id);
      this.logger.log(
        `Email notification sent for ${data.cveId} (CVSS ${data.cvssV3})`,
      );
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Unknown send error';
      this.logger.error(
        `Failed to send email notification for ${data.cveId}: ${errMessage}`,
      );
    }
  }

  private formatEmail(data: {
    cveId: string;
    cvssV3: number | null;
    hostIp: string;
    port: number | null;
    version: string | null;
    description: string;
  }): { subject: string; html: string } {
    const severity = this.getSeverity(data.cvssV3);
    const severityColor = this.getSeverityColor(data.cvssV3);

    const subject = `[CVE Alert] ${data.cveId} — ${severity} (CVSS ${data.cvssV3 ?? 'N/A'}) on ${data.hostIp}`;

    const portLine = data.port !== null
      ? `<tr><td style="padding:4px 8px;font-weight:bold;">Port</td><td style="padding:4px 8px;">${data.port}</td></tr>`
      : '';
    const versionLine = data.version
      ? `<tr><td style="padding:4px 8px;font-weight:bold;">Version</td><td style="padding:4px 8px;">${data.version}</td></tr>`
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:${severityColor};">🚨 Critical CVE Detected</h2>
        <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
          <tr style="background:#f5f5f5;">
            <td style="padding:4px 8px;font-weight:bold;">CVE</td>
            <td style="padding:4px 8px;">${data.cveId}</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;font-weight:bold;">CVSS</td>
            <td style="padding:4px 8px;">
              <span style="color:${severityColor};font-weight:bold;">${data.cvssV3 ?? 'N/A'}</span>
              (${severity})
            </td>
          </tr>
          <tr style="background:#f5f5f5;">
            <td style="padding:4px 8px;font-weight:bold;">Host</td>
            <td style="padding:4px 8px;">${data.hostIp}</td>
          </tr>
          ${portLine}
          ${versionLine}
        </table>
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:12px;margin-bottom:16px;">
          <strong>Description:</strong><br/>
          ${data.description}
        </div>
        <p style="color:#999;font-size:12px;">NVD Scanner — automated notification</p>
      </div>
    `.trim();

    return { subject, html };
  }

  private getSeverity(cvss: number | null): string {
    if (cvss === null) return 'Unknown';
    if (cvss >= 9) return 'Critical';
    if (cvss >= 7) return 'High';
    if (cvss >= 4) return 'Medium';
    return 'Low';
  }

  private getSeverityColor(cvss: number | null): string {
    if (cvss === null) return '#6c757d';
    if (cvss >= 9) return '#dc3545';
    if (cvss >= 7) return '#fd7e14';
    if (cvss >= 4) return '#ffc107';
    return '#28a745';
  }
}
