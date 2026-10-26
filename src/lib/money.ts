/**
 * Money formatting and validation utilities for BDT
 */

/**
 * Format an integer amount as BDT display string.
 * e.g. 1000 → "৳1,000"
 */
export function formatBDT(amount: number): string {
  const abs = Math.abs(amount);
  // Use Bengali locale formatting but keep Bengali Taka symbol
  const formatted = abs.toLocaleString('en-IN');
  return `৳${formatted}`;
}

/**
 * Format with explicit positive/negative sign
 */
export function formatBDTSigned(amount: number): string {
  if (amount === 0) return '৳0';
  return amount > 0 ? `+${formatBDT(amount)}` : `-${formatBDT(amount)}`;
}

/**
 * Parse a user-entered string to an integer taka amount.
 * Removes commas, whitespace, and the taka symbol before parsing.
 * Returns null if the input is not a valid non-negative integer.
 */
export function parseTaka(input: string): number | null {
  const cleaned = input.replace(/[৳,\s]/g, '').trim();
  if (cleaned === '') return null;
  const num = Number(cleaned);
  if (!Number.isInteger(num) || num < 0 || isNaN(num)) return null;
  return num;
}

/**
 * Validate that an amount is a positive integer.
 */
export function isValidAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0;
}

/**
 * Safe integer multiplication without floating-point drift.
 * Used when converting percentages to taka.
 */
export function safeMultiply(amount: number, factor: number): number {
  return Math.round(amount * factor);
}
