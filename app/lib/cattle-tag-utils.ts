// Utility functions for cattle tag generation and parsing

export function getAllPrefixes(): string[] {
  const prefixes: string[] = [];
  // 1-letter prefixes
  for (let i = 65; i <= 90; i++) {
    prefixes.push(String.fromCharCode(i));
  }
  // 2-letter prefixes (AA, AB, ..., AZ, BA, ..., ZZ)
  for (let i = 65; i <= 90; i++) {
    for (let j = 65; j <= 90; j++) {
      prefixes.push(String.fromCharCode(i) + String.fromCharCode(j));
    }
  }
  return prefixes;
}

/**
 * Returns the first prefix with less than 50 usages, in A-Z, AA-AZ, BA-BZ, ..., ZA-ZZ order.
 * Throws if all prefixes are exhausted.
 */
export function getNextAvailablePrefix(prefixUsage: Record<string, number>): string {
  const prefixes = getAllPrefixes();
  for (const prefix of prefixes) {
    if ((prefixUsage[prefix] ?? 0) < 50) {
      return prefix;
    }
  }
  throw new Error("No available prefixes");
}

/**
 * @deprecated Use getNextAvailablePrefix instead.
 */
export function getRandomPrefix(usedPrefixes: Set<string>): string {
  return getNextAvailablePrefix(Object.fromEntries(Array.from(usedPrefixes).map(p => [p, 1])));
}

export function parseTag(tag: string): { prefix: string, number: number } | null {
  const match = tag.match(/^([A-Z]+)(\d{1,3})$/);
  if (!match) return null;
  return { prefix: match[1], number: parseInt(match[2], 10) };
} 