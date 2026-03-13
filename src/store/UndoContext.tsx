import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface UndoAction {
  label: string;
  undo: () => Promise<void> | void;
}

interface UndoContextType {
  lastAction: UndoAction | null;
  pushAction: (label: string, undo: () => Promise<void> | void) => void;
  undoLastAction: () => Promise<void>;
  clearLastAction: () => void;
}

const UndoContext = createContext<UndoContextType | undefined>(undefined);

export function UndoProvider({ children }: { children: ReactNode }) {
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);

  const pushAction = useCallback((label: string, undo: () => Promise<void> | void) => {
    setLastAction({ label, undo });
    // Clear after 10 seconds
    setTimeout(() => {
      setLastAction(prev => (prev?.label === label ? null : prev));
    }, 10000);
  }, []);

  const undoLastAction = useCallback(async () => {
    if (lastAction) {
      await lastAction.undo();
      setLastAction(null);
    }
  }, [lastAction]);

  const clearLastAction = useCallback(() => {
    setLastAction(null);
  }, []);

  return (
    <UndoContext.Provider value={{ lastAction, pushAction, undoLastAction, clearLastAction }}>
      {children}
      {lastAction && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] animate-bounce-in">
          <div className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-4 border border-gray-700">
            <span className="text-sm font-medium">{lastAction.label}</span>
            <button
              onClick={undoLastAction}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-md text-xs font-bold transition-colors uppercase tracking-wider"
            >
              Отменить
            </button>
            <button
              onClick={clearLastAction}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const context = useContext(UndoContext);
  if (!context) {
    throw new Error('useUndo must be used within an UndoProvider');
  }
  return context;
}
