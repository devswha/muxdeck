import { ReactNode, useCallback } from 'react';

interface GridLayoutProps {
  children: ReactNode;
  focusedId?: string | null;
  onFocusChange?: (id: string | null) => void;
}

export function GridLayout({ children, focusedId, onFocusChange }: GridLayoutProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && focusedId) {
      onFocusChange?.(null);
    }
  }, [focusedId, onFocusChange]);

  if (focusedId) {
    return (
      <div
        className="h-full w-full p-4"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 auto-rows-[300px]"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
