import { ClaudeOperationStatus } from '../types/Session.js';

/**
 * Detects Claude operation status from terminal output in real-time.
 * Uses a sliding window of recent output to detect patterns.
 */
export class ClaudeStatusDetector {
  private recentOutput: string = '';
  private currentStatus: ClaudeOperationStatus = 'unknown';
  private lastStatusChange: number = Date.now();
  private debounceMs: number = 100; // Debounce rapid changes

  // Spinner patterns (Braille chars used by Claude Code)
  private static readonly SPINNER_PATTERN = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠠⠄⠂⠁]/;

  // Thinking text patterns
  private static readonly THINKING_PATTERNS = [
    /Thinking\.\.\./i,
    /Running tool\.\.\./i,
    /Searching\.\.\./i,
    /Reading\.\.\./i,
    /Writing\.\.\./i,
    /Executing\.\.\./i,
    /Editing\.\.\./i,
    /Analyzing\.\.\./i,
  ];

  // Input prompt patterns (Claude is waiting)
  private static readonly PROMPT_PATTERNS = [
    /^[>❯]\s*$/m,
    /^human>\s*$/im,
    /^\s*>\s*$/m,
  ];

  // Error patterns
  private static readonly ERROR_PATTERNS = [
    /^Error:/m,
    /^error\[E\d+\]/m,
    /ToolError:/,
    /APIError:/,
    /^FAILED:/im,
    /^panic:/im,
    /^fatal:/im,
    /^Exception:/m,
    /^\s*×/m,
  ];

  /**
   * Process new terminal output and detect status changes.
   * @returns The new status if changed, null otherwise
   */
  processOutput(data: string): ClaudeOperationStatus | null {
    // Append to recent output, keep last 2000 chars
    this.recentOutput += data;
    if (this.recentOutput.length > 2000) {
      this.recentOutput = this.recentOutput.slice(-2000);
    }

    // Get last few lines for pattern matching
    const lines = this.recentOutput.split('\n');
    const lastLines = lines.slice(-5).join('\n');

    // Clean ANSI escape codes for pattern matching
    const cleanOutput = lastLines
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/[\x00-\x1f]/g, ' ')
      .trim();

    const newStatus = this.detectStatus(cleanOutput);

    // Debounce: only report change if enough time has passed
    const now = Date.now();
    if (newStatus !== this.currentStatus && (now - this.lastStatusChange) > this.debounceMs) {
      this.currentStatus = newStatus;
      this.lastStatusChange = now;
      return newStatus;
    }

    return null;
  }

  private detectStatus(cleanOutput: string): ClaudeOperationStatus {
    // Priority 1: Check for spinner (most reliable indicator of active work)
    if (ClaudeStatusDetector.SPINNER_PATTERN.test(cleanOutput)) {
      return 'thinking';
    }

    // Priority 2: Check for thinking text patterns
    for (const pattern of ClaudeStatusDetector.THINKING_PATTERNS) {
      if (pattern.test(cleanOutput)) {
        return 'thinking';
      }
    }

    // Priority 3: Check for error patterns
    for (const pattern of ClaudeStatusDetector.ERROR_PATTERNS) {
      if (pattern.test(cleanOutput)) {
        return 'error';
      }
    }

    // Priority 4: Check for input prompt (waiting for user)
    for (const pattern of ClaudeStatusDetector.PROMPT_PATTERNS) {
      if (pattern.test(cleanOutput)) {
        return 'waiting_for_input';
      }
    }

    // Default: idle
    return 'idle';
  }

  getCurrentStatus(): ClaudeOperationStatus {
    return this.currentStatus;
  }

  reset(): void {
    this.recentOutput = '';
    this.currentStatus = 'unknown';
  }
}
