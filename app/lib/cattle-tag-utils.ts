// Utility functions for cattle tag generation and parsing

export function getAllPrefixes(): string[] {
  const prefixes: string[] = [];
  // 1-letter prefixes
  for (let i = 65; i <= 90; i++) {
    prefixes.push(String.fromCharCode(i));
  }
  // 2-letter prefixes
  for (let i = 65; i <= 90; i++) {
    for (let j = 65; j <= 90; j++) {
      prefixes.push(String.fromCharCode(i) + String.fromCharCode(j));
    }
  }
  return prefixes;
}

export function getRandomPrefix(usedPrefixes: Set<string>): string {
  const PREFIX_POOL = getAllPrefixes();
  const available = PREFIX_POOL.filter(p => !usedPrefixes.has(p));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  // If all are used, generate a new random 2-letter prefix
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let str = chars.charAt(Math.floor(Math.random() * 26)) + chars.charAt(Math.floor(Math.random() * 26));
  while (usedPrefixes.has(str)) {
    str = chars.charAt(Math.floor(Math.random() * 26)) + chars.charAt(Math.floor(Math.random() * 26));
  }
  return str;
}

export function parseTag(tag: string): { prefix: string, number: number } | null {
  const match = tag.match(/^([A-Z]+)(\d{1,3})$/);
  if (!match) return null;
  return { prefix: match[1], number: parseInt(match[2], 10) };
} 