import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Log to backend
    fetch('/api/frontend-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        level: 'error',
        source: 'ErrorBoundary',
        message: 'Uncaught React Error',
        context: {
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack
        }
      })
    }).catch(e => console.error('Failed to send error log to backend', e));
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-8">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Что-то пошло не так</h1>
            <p className="text-gray-700 mb-4">В приложении произошла непредвиденная ошибка. Информация об ошибке записана в лог.</p>
            <div className="bg-gray-100 p-4 rounded overflow-auto max-h-64 text-sm font-mono text-gray-800">
              {this.state.error?.message}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
