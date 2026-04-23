import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

let transporter: Transporter | null = null;

function hasSmtpConfig() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function getTransporter() {
  if (!hasSmtpConfig()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER!,
        pass: env.SMTP_PASS!,
      },
    });
  }

  return transporter;
}

interface SendMailInput {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(input: SendMailInput) {
  const smtpTransport = getTransporter();
  if (!smtpTransport) {
    console.log("[mail:mock] SMTP not configured. Email content follows:");
    console.log(`To: ${input.to}`);
    console.log(`Subject: ${input.subject}`);
    console.log(input.text);
    return { delivered: false, mocked: true };
  }

  await smtpTransport.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });

  return { delivered: true, mocked: false };
}

export async function sendTemporaryPasswordEmail(params: {
  to: string;
  studentNumber: string;
  temporaryPassword: string;
  expiryDays: number;
}) {
  const text = [
    "Welcome to the Dorm Management System.",
    "",
    `Student Number: ${params.studentNumber}`,
    `Temporary Password: ${params.temporaryPassword}`,
    "",
    `This temporary password expires in ${params.expiryDays} day(s).`,
    "On first login, you will be required to verify OTP and set a new password.",
  ].join("\n");

  return sendEmail({
    to: params.to,
    subject: "Dorm Account Temporary Password",
    text,
  });
}

export async function sendFirstLoginOtpEmail(params: {
  to: string;
  studentNumber: string;
  otp: string;
  expiryMinutes: number;
}) {
  const text = [
    "Your first-login OTP code:",
    "",
    `Student Number: ${params.studentNumber}`,
    `OTP: ${params.otp}`,
    "",
    `The OTP expires in ${params.expiryMinutes} minutes.`,
    "If you did not request this, contact the dorm administration.",
  ].join("\n");

  return sendEmail({
    to: params.to,
    subject: "Dorm Account First Login OTP",
    text,
  });
}
