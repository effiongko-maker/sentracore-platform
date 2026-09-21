import "server-only";
import { randomInt } from "node:crypto";

// No look-alike characters (0/O, 1/l/I) so an administrator can read a password out or type it without error.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const ALL = LOWER + UPPER + DIGIT;
const GROUPS = 5;
const GROUP_SIZE = 4;

/**
 * A cryptographically random temporary password: 20 characters (>100 bits) in five dash-separated groups, with at
 * least one lower-case letter, upper-case letter and digit. Generated per request, returned ONCE to the creating
 * administrator, and never stored, logged or audited anywhere in SentraCore™.
 */
export function generateTemporaryPassword(): string {
  const chars: string[] = [LOWER, UPPER, DIGIT].map((set) => set[randomInt(set.length)]!);
  while (chars.length < GROUPS * GROUP_SIZE) chars.push(ALL[randomInt(ALL.length)]!);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) groups.push(chars.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE).join(""));
  return groups.join("-");
}
