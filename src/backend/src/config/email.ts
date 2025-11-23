import nodemailer from 'nodemailer';
import { EMAIL_USER, EMAIL_PASSWORD } from './index';

export interface EmailConfig {
    service: string;
    auth: {
        user?: string;
        pass?: string;
    };
}

export const emailConfig: EmailConfig = {
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
    }
};

// Create transporter for sending emails
export const emailTransporter = nodemailer.createTransport({
    service: emailConfig.service,
    auth: emailConfig.auth
});

// Email templates
export const emailTemplates = {
    verification: (verificationCode: string, username: string) => ({
        subject: 'Email Verification - Transcendence',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #3b82f6; text-align: center;">Email Verification</h2>
                <p>Hello ${username},</p>
                <p>You have requested a email verification. Please use the following verification code to complete the process:</p>
                <div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <h1 style="color: #1f2937; margin: 0; font-size: 32px; letter-spacing: 4px;">${verificationCode}</h1>
                </div>
                <p>This code will expire in 15 minutes.</p>
                <p>If you did not request this change, please ignore this email.</p>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px; text-align: center;">
                    This is an automated message from Transcendence. Please do not reply to this email.
                </p>
            </div>
        `
    }),
    twoFactor: (verificationCode: string, username: string) => ({
        subject: 'Two-Factor Authentication - Transcendence',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #3b82f6; text-align: center;">Two-Factor Authentication</h2>
                <p>Hello ${username},</p>
                <p>Someone is trying to log in to your account. Please use the following code to complete the login:</p>
                <div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <h1 style="color: #1f2937; margin: 0; font-size: 32px; letter-spacing: 4px;">${verificationCode}</h1>
                </div>
                <p>This code will expire in 10 minutes.</p>
                <p><strong>If you did not attempt to log in, please secure your account immediately.</strong></p>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px; text-align: center;">
                    This is an automated message from Transcendence. Please do not reply to this email.
                </p>
            </div>
        `
    })
};

export async function sendVerificationEmail(to: string, verificationCode: string, username: string, is2FA: boolean = false): Promise<boolean> {
    try {
        const template = is2FA 
            ? emailTemplates.twoFactor(verificationCode, username)
            : emailTemplates.verification(verificationCode, username);
            
        const mailOptions = {
            from: emailConfig.auth.user,
            to: to,
            ...template
        };

        const result = await emailTransporter.sendMail(mailOptions);
        console.log(`${is2FA ? '2FA' : 'Verification'} email sent:`, result.messageId);
        return true;
    } catch (error) {
        console.error(`Error sending ${is2FA ? '2FA' : 'verification'} email:`, error);
        return false;
    }
}
