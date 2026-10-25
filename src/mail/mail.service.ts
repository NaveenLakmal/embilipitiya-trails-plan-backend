import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendOtpOptions {
  to: string;
  otp: string;
  purpose: 'login' | 'reset_password' | 'signup' | 'customer_reset_password';
  name?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.configService.get<number>('SMTP_PORT', 465));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!user || !pass) {
      this.logger.warn(
        'SMTP credentials (SMTP_USER / SMTP_PASS) are not configured. Outgoing emails will be unavailable.',
      );
      this.transporter = null;
      return;
    }

    const secure = port === 465;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  /**
   * For testing or dynamic reconfiguration
   */
  setTransporter(transporter: nodemailer.Transporter | null): void {
    this.transporter = transporter;
  }

  async sendOtpEmail(options: SendOtpOptions): Promise<void> {
    const { to, otp, purpose, name } = options;

    if (!this.transporter) {
      this.logger.error('Cannot send email: SMTP transporter is not configured.');
      throw new ServiceUnavailableException(
        'Email service is currently unavailable. Please verify backend SMTP configuration.',
      );
    }

    const fromName = this.configService.get<string>('MAIL_FROM_NAME', 'EmbiTrail');
    const fromAddress =
      this.configService.get<string>('MAIL_FROM_ADDRESS') ||
      this.configService.get<string>('SMTP_USER', 'noreply@embitrail.lk');

    let actionTitle: string;
    let actionDescription: string;
    let subHeader: string;

    switch (purpose) {
      case 'signup':
        actionTitle = 'Verify Your Email';
        actionDescription = name
          ? `Welcome to EmbiTrail, ${name}! Please enter this 6-digit code to verify your email address and activate your account.`
          : 'Welcome to EmbiTrail! Please enter this 6-digit code to verify your email address and activate your account.';
        subHeader = 'Visitor Account Verification';
        break;
      case 'customer_reset_password':
        actionTitle = 'Password Recovery';
        actionDescription = 'A password recovery request was initiated for your EmbiTrail account. Enter this 6-digit code to reset your password.';
        subHeader = 'Account Security Verification';
        break;
      case 'reset_password':
        actionTitle = 'Admin Password Recovery';
        actionDescription = 'A password recovery request was initiated for your EmbiTrail administrator account.';
        subHeader = 'Administrator Security Verification';
        break;
      case 'login':
      default:
        actionTitle = 'Admin Login Verification';
        actionDescription = 'A login attempt was initiated for your EmbiTrail administrator account.';
        subHeader = 'Administrator Security Verification';
        break;
    }

    const subject = `EmbiTrail — ${actionTitle} Code`;

    const textContent = [
      `EmbiTrail — ${actionTitle}`,
      '----------------------------------------',
      actionDescription,
      '',
      `Your verification code is: ${otp}`,
      '',
      'This code expires in 5 minutes.',
      'Security notice: Never share this code with anyone. EmbiTrail staff will never ask for your verification code.',
      'If you did not request this verification code, please ignore this email.',
      '----------------------------------------',
      'EmbiTrail Tourism & Travel Planning Platform',
    ].join('\n');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${actionTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="540px" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f766e; padding: 24px 32px; text-align: left;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">EmbiTrail</h1>
              <p style="margin: 4px 0 0 0; color: #ccfbf1; font-size: 13px;">${subHeader}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px 0; color: #111827; font-size: 18px; font-weight: 600;">${actionTitle}</h2>
              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">${actionDescription}</p>

              <!-- OTP Code Display -->
              <div style="background-color: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
                <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #0f766e; display: block; margin-bottom: 6px;">Verification Code</span>
                <span style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #111827; font-family: monospace; display: inline-block;">${otp}</span>
              </div>

              <!-- Notice Details -->
              <p style="margin: 16px 0; color: #374151; font-size: 13px; line-height: 1.5;">
                ⏱ <strong>This code will expire in 5 minutes.</strong>
              </p>
              <p style="margin: 16px 0; color: #b91c1c; font-size: 13px; line-height: 1.5;">
                🔒 <strong>Do not share this code.</strong> EmbiTrail administrators and support personnel will never request your code.
              </p>
              <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
                If you did not initiate this request, you can safely ignore this email. No changes will take effect without this code.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">© ${new Date().getFullYear()} EmbiTrail. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        text: textContent,
        html: htmlContent,
      });
      this.logger.log(`Verification email sent to recipient for ${purpose}`);
    } catch (error: any) {
      // Safe logging: never expose passwords or sensitive credentials
      this.logger.error(
        `Failed to deliver verification email via SMTP: ${error?.message || 'Network error'}`,
      );
      throw new ServiceUnavailableException(
        'Failed to send verification email. Please check SMTP settings or try again later.',
      );
    }
  }
}
