import { createHash } from "crypto";
import { env } from "../config/env";

const COMMON_BREACHED_PASSWORDS = new Set([
  "password",
  "password1",
  "123456",
  "12345678",
  "qwerty",
  "abc123",
  "letmein",
  "welcome",
  "admin",
]);

function hasStrongComplexity(password: string): boolean {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const hasNoSpaces = !/\s/.test(password);

  return hasLower && hasUpper && hasDigit && hasSpecial && hasNoSpaces;
}

async function isPwnedViaHibp(password: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        "Add-Padding": "true",
      },
    });

    if (!response.ok) {
      throw new Error(`HIBP request failed with status ${response.status}`);
    }

    const body = await response.text();
    const lines = body.split("\n");

    for (const line of lines) {
      const [hashSuffix, countRaw] = line.trim().split(":");
      if (!hashSuffix || !countRaw) continue;
      if (hashSuffix.toUpperCase() !== suffix) continue;

      const count = Number(countRaw);
      return Number.isFinite(count) && count >= env.HIBP_PWNED_COUNT_THRESHOLD;
    }

    return false;
  } catch {
    if (env.HIBP_FAIL_CLOSED) {
      return true;
    }
    return false;
  }
}

export async function assertStrongPasswordOrThrow(password: string): Promise<void> {
  if (password.length < env.PASSWORD_MIN_LENGTH) {
    throw Object.assign(
      new Error(`Password must be at least ${env.PASSWORD_MIN_LENGTH} characters long`),
      { statusCode: 400 }
    );
  }

  if (!hasStrongComplexity(password)) {
    throw Object.assign(
      new Error("Password must include uppercase, lowercase, number, and special character"),
      { statusCode: 400 }
    );
  }

  if (COMMON_BREACHED_PASSWORDS.has(password.toLowerCase())) {
    throw Object.assign(new Error("Password is too common and has appeared in breaches"), {
      statusCode: 400,
    });
  }

  if (env.HIBP_API_ENABLED) {
    const isPwned = await isPwnedViaHibp(password);
    if (isPwned) {
      throw Object.assign(new Error("Password has appeared in known data breaches"), {
        statusCode: 400,
      });
    }
  }
}
