import "server-only";

import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// Shared 4–8 digit PIN rule for workers and the intake gate.
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
