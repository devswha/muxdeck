import { useEffect, useRef, useCallback, memo } from 'react';
import { useTerminal } from '../hooks/useTerminal';

interface TerminalProps {
  sessionId: string;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onReady?: (write: (data: string) => void, writeln: (data: string) => void) => void;
}

export const TerminalComponent = memo(function Terminal({
  sessionId,
  onInput,
  onResize,
  onReady,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const handleData = useCallback((data: string) => {
    // Filter out terminal device attribute responses that xterm.js auto-generates
    // These cause feedback loops when sent back to tmux:
    // - Primary DA response: ESC [ ? ... c (e.g., \x1b[?1;2c)
    // - Secondary DA response: ESC [ > ... c (e.g., \x1b[>0;276;0c)
    const filtered = data.replace(/\x1b\[\?[\d;]*c/g, '').replace(/\x1b\[>[\d;]*c/g, '');
    if (filtered) {
      onInput(sessionId, filtered);
    }
  }, [sessionId, onInput]);

  const handleResize = useCallback((cols: number, rows: number) => {
    onResize(sessionId, cols, rows);
  }, [sessionId, onResize]);

  const { initTerminal, write, writeln, focus, fit } = useTerminal({
    onData: handleData,
    onResize: handleResize,
  });

  // Use ref for onReady to keep effect stable
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (containerRef.current && !initializedRef.current) {
      initializedRef.current = true;
      const cleanup = initTerminal(containerRef.current);
      onReadyRef.current?.(write, writeln);
      return () => {
        initializedRef.current = false;  // Reset so terminal can be reinitialized
        cleanup?.();
      };
    }
  }, [initTerminal, write, writeln, sessionId]);

  // Re-fit on visibility change
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        fit();
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [fit]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-[200px]"
      onClick={focus}
    />
  );
});
