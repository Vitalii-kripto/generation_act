import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UpdResponse } from '../types';

interface UpdContextType {
  upds: UpdResponse[];
  loading: boolean;
  error: string | null;
  fetchUpds: () => Promise<void>;
  createUpd: (upd: Omit<UpdResponse, 'acceptanceDate' | 'paymentDate' | 'daysUntilPayment' | 'status'>, overwrite?: boolean) => Promise<UpdResponse>;
  updateUpd: (id: string, upd: Omit<UpdResponse, 'acceptanceDate' | 'paymentDate' | 'daysUntilPayment' | 'status'>) => Promise<UpdResponse>;
  deleteUpd: (id: string) => Promise<UpdResponse | undefined>;
  exportUpds: () => void;
}

const UpdContext = createContext<UpdContextType | undefined>(undefined);

export const UpdProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [upds, setUpds] = useState<UpdResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUpds = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/upds');
      if (!response.ok) throw new Error('Failed to fetch UPDs');
      const data = await response.json();
      setUpds(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const createUpd = async (upd: any, overwrite = false) => {
    try {
      const response = await fetch(`/api/upds?overwrite=${overwrite}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upd),
      });
      if (!response.ok) {
        const errData = await response.json();
        const errorMessage = typeof errData.detail === 'string' 
          ? errData.detail 
          : JSON.stringify(errData.detail) || 'Failed to create UPD';
        throw new Error(errorMessage);
      }
      const newUpd = await response.json();
      setUpds(prev => [newUpd, ...prev.filter(u => u.id !== newUpd.id)]);
      return newUpd;
    } catch (err) {
      throw err;
    }
  };

  const updateUpd = async (id: string, upd: any) => {
    try {
      const response = await fetch(`/api/upds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upd),
      });
      if (!response.ok) {
        const errData = await response.json();
        const errorMessage = typeof errData.detail === 'string' 
          ? errData.detail 
          : JSON.stringify(errData.detail) || 'Failed to update UPD';
        throw new Error(errorMessage);
      }
      const updatedUpd = await response.json();
      setUpds(prev => prev.map(u => u.id === id ? updatedUpd : u));
      return updatedUpd;
    } catch (err) {
      throw err;
    }
  };

  const deleteUpd = async (id: string) => {
    try {
      const updToDelete = upds.find(u => u.id === id);
      const response = await fetch(`/api/upds/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete UPD');
      setUpds(prev => prev.filter(u => u.id !== id));
      return updToDelete;
    } catch (err) {
      throw err;
    }
  };

  const exportUpds = () => {
    window.open('/api/upds/export', '_blank');
  };

  useEffect(() => {
    fetchUpds();
  }, []);

  return (
    <UpdContext.Provider value={{ upds, loading, error, fetchUpds, createUpd, updateUpd, deleteUpd, exportUpds }}>
      {children}
    </UpdContext.Provider>
  );
};

export const useUpdContext = () => {
  const context = useContext(UpdContext);
  if (context === undefined) {
    throw new Error('useUpdContext must be used within a UpdProvider');
  }
  return context;
};
