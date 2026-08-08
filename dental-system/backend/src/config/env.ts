import dotenv from 'dotenv';

dotenv.config();

export function getAppUrl(): string {
  return (process.env.APP_URL?.trim() || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
}

export function getMailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    'NexusDent <onboarding@resend.dev>'
  );
}

export function getResendApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() || '';
}
