import { useRef, useCallback, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import '@xterm/xterm/css/xterm.css';

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function useTerminal({ onData, onResize }: UseTerminalOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Use refs for callbacks to keep initTerminal stable
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onDataRef.current = onData;
    onResizeRef.current = onResize;
  }, [onData, onResize]);

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontWeight: '400',
      fontWeightBold: '600',
      letterSpacing: 0,
      lineHeight: 1.0,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new Unicode11Addon());
    terminal.loadAddon(new ClipboardAddon());

    terminal.open(container);

    // Try WebGL, fall back to Canvas
    try {
      terminal.loadAddon(new WebglAddon());
    } catch (e) {
      console.warn('WebGL not available, using Canvas renderer');
    }

    // Delay fit() to ensure container has dimensions
    // Use multiple frames to handle flex layout calculation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          fitAddon.fit();
        }
      });
    });

    // Handle user input
    terminal.onData((data) => {
      onDataRef.current?.(data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        fitAddon.fit();
        const { cols, rows } = terminal;
        onResizeRef.current?.(cols, rows);
      }
    });
    resizeObserver.observe(container);

    // Auto-copy on selection (drag to copy)
    const handleMouseUp = () => {
      const selection = terminal.getSelection();
      if (selection && selection.length > 0) {
        navigator.clipboard.writeText(selection).catch((err) => {
          console.warn('Failed to copy to clipboard:', err);
        });
      }
    };
    container.addEventListener('mouseup', handleMouseUp);

    // Ctrl+V / Cmd+V to paste
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ctrl+V or Cmd+V for paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            onDataRef.current?.(text);
          }
        } catch (err) {
          console.warn('Failed to paste from clipboard:', err);
        }
      }
    };
    container.addEventListener('keydown', handleKeyDown);

    // Right-click to paste
    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          onDataRef.current?.(text);
        }
      } catch (err) {
        console.warn('Failed to paste from clipboard:', err);
      }
    };
    container.addEventListener('contextmenu', handleContextMenu);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    containerRef.current = container;

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('contextmenu', handleContextMenu);
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const writeln = useCallback((data: string) => {
    terminalRef.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const fit = useCallback(() => {
    if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
      fitAddonRef.current?.fit();
    }
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const getDimensions = useCallback(() => {
    if (!terminalRef.current) return { cols: 80, rows: 24 };
    return {
      cols: terminalRef.current.cols,
      rows: terminalRef.current.rows,
    };
  }, []);

  return {
    initTerminal,
    write,
    writeln,
    clear,
    fit,
    focus,
    getDimensions,
    terminalRef,
  };
}
