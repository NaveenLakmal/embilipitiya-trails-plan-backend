import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { MailService } from './mail.service';

describe('MailService', () => {
  let mailService: MailService;
  let mockConfigService: Partial<ConfigService>;
  let mockTransporter: any;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          SMTP_HOST: 'smtp.gmail.com',
          SMTP_PORT: 465,
          SMTP_USER: 'test@embitrail.lk',
          SMTP_PASS: 'app-password-1234',
          MAIL_FROM_NAME: 'EmbiTrail',
          MAIL_FROM_ADDRESS: 'noreply@embitrail.lk',
        };
        return config[key] ?? defaultValue;
      }),
    };

    mailService = new MailService(mockConfigService as ConfigService);
    mockTransporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-123' }),
    };
    mailService.setTransporter(mockTransporter);
  });

  it('should throw ServiceUnavailableException if transporter is not configured', async () => {
    mailService.setTransporter(null);
    await expect(
      mailService.sendOtpEmail({
        to: 'admin@embitrail.lk',
        otp: '123456',
        purpose: 'login',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should send email with correct fields and HTML content for login OTP', async () => {
    await mailService.sendOtpEmail({
      to: 'admin@embitrail.lk',
      otp: '654321',
      purpose: 'login',
    });

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockTransporter.sendMail.mock.calls[0][0];

    expect(mailArgs.to).toBe('admin@embitrail.lk');
    expect(mailArgs.from).toBe('"EmbiTrail" <noreply@embitrail.lk>');
    expect(mailArgs.subject).toContain('Admin Login Verification');
    expect(mailArgs.text).toContain('654321');
    expect(mailArgs.text).toContain('5 minutes');
    expect(mailArgs.html).toContain('654321');
    expect(mailArgs.html).toContain('EmbiTrail');
    expect(mailArgs.html).toContain('5 minutes');
  });

  it('should format recovery email appropriately', async () => {
    await mailService.sendOtpEmail({
      to: 'admin@embitrail.lk',
      otp: '789012',
      purpose: 'reset_password',
    });

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockTransporter.sendMail.mock.calls[0][0];

    expect(mailArgs.subject).toContain('Admin Password Recovery');
    expect(mailArgs.html).toContain('Admin Password Recovery');
    expect(mailArgs.html).toContain('789012');
  });

  it('should handle SMTP failure safely without leaking sensitive information', async () => {
    mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP connection refused: auth failed'));

    await expect(
      mailService.sendOtpEmail({
        to: 'admin@embitrail.lk',
        otp: '111222',
        purpose: 'login',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
