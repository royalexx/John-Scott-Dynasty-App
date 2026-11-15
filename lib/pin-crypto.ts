import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

/** Persist only salted scrypt hashes. Legacy plaintext PINs can be checked during migration. */
const SCRYPT_KEY_LENGTH = 32

export function hashManagerPin(pin: string) {
  const salt = randomBytes(16).toString("base64url")
  const hash = scryptSync(pin, salt, SCRYPT_KEY_LENGTH).toString("base64url")
  return `scrypt$${salt}$${hash}`
}

export function verifyManagerPin(storedPin: string, providedPin: string) {
  if (storedPin.startsWith("scrypt$")) {
    const [scheme, salt, encoded] = storedPin.split("$")
    const expected = encoded ? Buffer.from(encoded, "base64url") : Buffer.alloc(0)
    if (scheme !== "scrypt" || !salt || expected.length === 0) {
      timingSafeEqual(Buffer.from(providedPin), Buffer.alloc(providedPin.length))
      return false
    }
    const actual = scryptSync(providedPin, salt, expected.length)
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  }
  const provided = Buffer.from(providedPin)
  const stored = Buffer.from(storedPin)
  if (stored.length !== provided.length) {
    timingSafeEqual(provided, Buffer.alloc(provided.length))
    return false
  }
  return timingSafeEqual(stored, provided)
}

export function isHashedManagerPin(stored: string): boolean {
  return stored.startsWith("scrypt$")
}
