import * as nodemailer from 'nodemailer';

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));

jest.mock('nodemailer', () => ({
  createTransport: (...args: any[]) => createTransportMock(...args),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { NotificationRepository } from './repositories/notification.repository';
import { ConfigService } from '@nestjs/config';

const mockNotificationRepository = {
  create: jest.fn(),
  markSent: jest.fn(),
  findUnsent: jest.fn(),
};

function createConfig(overrides: Record<string, any> = {}) {
  return {
    get: jest.fn().mockImplementation((key: string, def: any) => {
      const map: Record<string, any> = {
        SMTP_HOST: 'smtp.test.com',
        SMTP_PORT: '587',
        SMTP_USER: 'user@test.com',
        SMTP_PASS: 'pass',
        SMTP_TO_EMAIL: 'admin@test.com',
        SMTP_FROM_EMAIL: 'scanner@test.com',
        CVE_NOTIFY_THRESHOLD: '7',
        ...overrides,
      };
      return map[key] ?? def;
    }),
  };
}

describe('NotificationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({ messageId: 'test-id' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createService(configOverrides: Record<string, any> = {}) {
    return Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationRepository, useValue: mockNotificationRepository },
        { provide: ConfigService, useValue: createConfig(configOverrides) },
      ],
    }).compile().then(async (m) => {
      const svc = m.get<NotificationsService>(NotificationsService);
      await svc.onModuleInit();
      return svc;
    });
  }

  describe('notifyCriticalCve()', () => {
    it('should skip if cvssV3 is below threshold', async () => {
      const service = await createService();

      await service.notifyCriticalCve({
        cveId: 'CVE-2024-0001',
        cvssV3: 5.0,
        hostIp: '1.2.3.4',
        port: 80,
        version: 'Apache 2.4',
        description: 'Test',
      });

      expect(mockNotificationRepository.create).not.toHaveBeenCalled();
    });

    it('should notify if cvssV3 is null (unknown severity)', async () => {
      mockNotificationRepository.create.mockResolvedValue({ id: 1, sent: false });
      const service = await createService();

      await service.notifyCriticalCve({
        cveId: 'CVE-2024-0002',
        cvssV3: null,
        hostIp: '1.2.3.4',
        port: 443,
        version: 'OpenSSL 1.1',
        description: 'Test',
      });

      expect(mockNotificationRepository.create).toHaveBeenCalled();
      expect(sendMailMock).toHaveBeenCalled();
    });

    it('should save and send email if cvssV3 >= threshold', async () => {
      mockNotificationRepository.create.mockResolvedValue({ id: 1, sent: false });
      const service = await createService();

      await service.notifyCriticalCve({
        cveId: 'CVE-2024-9999',
        cvssV3: 9.8,
        hostIp: '10.0.0.1',
        port: 443,
        version: 'OpenSSL 3.0.2',
        description: 'Critical buffer overflow',
      });

      expect(mockNotificationRepository.create).toHaveBeenCalledWith({
        cveId: 'CVE-2024-9999',
        cvssV3: 9.8,
        hostIp: '10.0.0.1',
        port: 443,
        version: 'OpenSSL 3.0.2',
        description: 'Critical buffer overflow',
      });
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@test.com',
          from: 'scanner@test.com',
          subject: expect.stringContaining('CVE-2024-9999'),
        }),
      );
      expect(mockNotificationRepository.markSent).toHaveBeenCalledWith(1);
    });

    it('should not send if SMTP is not configured', async () => {
      mockNotificationRepository.create.mockResolvedValue({ id: 2, sent: false });
      const service = await createService({ SMTP_HOST: '', SMTP_USER: '' });

      await service.notifyCriticalCve({
        cveId: 'CVE-2024-0003',
        cvssV3: 8.5,
        hostIp: '1.2.3.4',
        port: 22,
        version: 'OpenSSH 8.9',
        description: 'Test vuln',
      });

      expect(mockNotificationRepository.create).toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should not send if recipient email is not configured', async () => {
      mockNotificationRepository.create.mockResolvedValue({ id: 3, sent: false });
      const service = await createService({ SMTP_TO_EMAIL: '' });

      await service.notifyCriticalCve({
        cveId: 'CVE-2024-0005',
        cvssV3: 7.5,
        hostIp: '1.2.3.4',
        port: 3306,
        version: 'MySQL 8.0',
        description: 'SQL injection',
      });

      expect(mockNotificationRepository.create).toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should handle email send errors gracefully', async () => {
      mockNotificationRepository.create.mockResolvedValue({ id: 4, sent: false });
      sendMailMock.mockRejectedValue(new Error('SMTP connection refused'));
      const service = await createService();

      await expect(
        service.notifyCriticalCve({
          cveId: 'CVE-2024-0006',
          cvssV3: 9.1,
          hostIp: '1.2.3.4',
          port: 5432,
          version: 'PostgreSQL 14',
          description: 'RCE vulnerability',
        }),
      ).resolves.not.toThrow();

      expect(mockNotificationRepository.markSent).not.toHaveBeenCalled();
    });

    it('should send startup notification if SMTP is configured', async () => {
      mockNotificationRepository.create.mockResolvedValue({ id: 1, sent: false });
      const service = await createService();

      await service.notifyAppStarted();

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '[NVD Scanner] Application Started',
        }),
      );
    });

    it('should not send startup notification if SMTP is not configured', async () => {
      const service = await createService({ SMTP_HOST: '', SMTP_USER: '' });

      await service.notifyAppStarted();

      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should format subject with severity', async () => {
      mockNotificationRepository.create.mockResolvedValue({ id: 5, sent: false });
      const service = await createService();

      await service.notifyCriticalCve({
        cveId: 'CVE-2024-1111',
        cvssV3: 10.0,
        hostIp: '10.0.0.5',
        port: 8080,
        version: 'Nginx 1.21',
        description: 'Remote code execution',
      });

      const mailCall = sendMailMock.mock.calls[0][0];
      expect(mailCall.subject).toContain('Critical');
      expect(mailCall.subject).toContain('CVE-2024-1111');
      expect(mailCall.html).toContain('10.0.0.5');
      expect(mailCall.html).toContain('8080');
    });
  });
});
