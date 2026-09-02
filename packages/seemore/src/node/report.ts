import pc from 'picocolors';

/**
 * Warnings are collected and printed once, as a grouped summary, rather than interleaved
 * with progress output — a build that prints forty warnings between chunks is a
 * build whose warnings nobody reads.
 */
export interface WarningCollector {
  add(message: string): void;
  list(): string[];
  clear(): void;
  /** Print the grouped summary. Returns the number of warnings printed. */
  flush(log?: (line: string) => void): number;
}

export function createWarningCollector(): WarningCollector {
  const seen = new Set<string>();

  return {
    add(message) {
      seen.add(message);
    },
    list: () => [...seen],
    clear: () => seen.clear(),
    flush(log = console.warn) {
      const messages = [...seen].sort();
      seen.clear();
      if (messages.length === 0) return 0;
      log('');
      log(pc.yellow(`${messages.length} warning${messages.length === 1 ? '' : 's'}:`));
      for (const message of messages) log(pc.yellow(`  - ${message}`));
      log('');
      return messages.length;
    },
  };
}
