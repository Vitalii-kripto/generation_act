import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Act, SpecificationItem } from '../types';

interface ActContextType {
  acts: Act[];
  fetchActs: () => Promise<void>;
  addAct: (act: Act) => void;
  updateAct: (id: string, act: Act) => void;
  deleteAct: (id: string) => Promise<void>;
  deleteAllActs: () => Promise<void>;
  saveActToDb: (act: Act) => Promise<void>;
  downloadDocx: (act: Act) => Promise<void>;
  nextActNumber: number;
  setNextActNumber: (num: number) => void;
  signatureImage: string | null;
  setSignatureImage: (img: string | null) => void;
  stampImage: string | null;
  setStampImage: (img: string | null) => void;
  specification: SpecificationItem[];
  setSpecification: (spec: SpecificationItem[]) => void;
}

const ActContext = createContext<ActContextType | undefined>(undefined);

export function ActProvider({ children }: { children: ReactNode }) {
  const [acts, setActs] = useState<Act[]>([]);
  const [specification, setSpecificationState] = useState<SpecificationItem[]>([]);
  const [nextActNumber, setNextActNumberState] = useState<number>(1);
  const [signatureImage, setSignatureImageState] = useState<string | null>(null);
  const [stampImage, setStampImageState] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Load data from localStorage after initial render to avoid blocking
    try {
      const savedSpec = localStorage.getItem('specification');
      if (savedSpec) setSpecificationState(JSON.parse(savedSpec));
    } catch (e) {
      console.error("Failed to parse specification from localStorage", e);
      localStorage.removeItem('specification');
    }

    try {
      const savedNum = localStorage.getItem('nextActNumber');
      if (savedNum) setNextActNumberState(parseInt(savedNum, 10));
    } catch (e) {
      console.error("Failed to parse nextActNumber from localStorage", e);
      localStorage.removeItem('nextActNumber');
    }

    try {
      const savedSig = localStorage.getItem('signatureImage');
      if (savedSig) setSignatureImageState(savedSig);
    } catch (e) {
      console.error("Failed to load signatureImage from localStorage", e);
      localStorage.removeItem('signatureImage');
    }

    try {
      const savedStamp = localStorage.getItem('stampImage');
      if (savedStamp) setStampImageState(savedStamp);
    } catch (e) {
      console.error("Failed to load stampImage from localStorage", e);
      localStorage.removeItem('stampImage');
    }
    
    setIsInitialized(true);
  }, []);

  const fetchActs = async () => {
    try {
      const response = await fetch('/api/acts');
      if (response.ok) {
        const data = await response.json();
        setActs(data);
      }
    } catch (error) {
      console.error('Failed to fetch acts from Python DB:', error);
    }
  };

  useEffect(() => {
    fetchActs();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('nextActNumber', nextActNumber.toString());
    }
  }, [nextActNumber, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('specification', JSON.stringify(specification));
    }
  }, [specification, isInitialized]);

  const addAct = (act: Act) => {
    setActs((prev) => [act, ...prev]);
    setNextActNumberState((prev) => prev + 1);
  };

  const updateAct = (id: string, updatedAct: Act) => {
    setActs((prev) => prev.map((act) => act.id === id ? updatedAct : act));
  };

  const deleteAct = async (id: string) => {
    console.log('deleteAct called for id:', id);
    try {
      const response = await fetch(`/api/acts/${id}`, {
        method: 'DELETE',
      });
      console.log('deleteAct response status:', response.status);
      if (response.ok) {
        setActs((prev) => prev.filter((act) => act.id !== id));
      } else {
        console.error('Delete error:', response.statusText);
        alert('Ошибка при удалении акта из базы данных');
      }
    } catch (error) {
      console.error('Failed to delete act:', error);
      alert('Ошибка связи с сервером при удалении');
    }
  };

  const deleteAllActs = async () => {
    console.log('deleteAllActs called');
    try {
      const response = await fetch('/api/acts', {
        method: 'DELETE',
      });
      console.log('deleteAllActs response status:', response.status);
      if (response.ok) {
        setActs([]);
        setNextActNumberState(1);
      } else {
        console.error('Delete all error:', response.statusText);
        alert('Ошибка при очистке реестра');
      }
    } catch (error) {
      console.error('Failed to delete all acts:', error);
      alert('Ошибка связи с сервером при удалении всех записей');
    }
  };

  const saveActToDb = async (act: Act) => {
    try {
      const response = await fetch('/api/acts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(act)
      });
      if (response.ok) {
        const res = await fetch('/api/acts');
        const data = await res.json();
        setActs(data);
      } else {
        console.error('Save error status:', response.status, response.statusText);
        let detail = response.statusText;
        try {
          const errorData = await response.json();
          detail = typeof errorData.detail === 'string' 
            ? errorData.detail 
            : JSON.stringify(errorData.detail);
          console.error('Save error details:', errorData);
        } catch (e) {
          console.error('Failed to parse error response as JSON');
        }
        alert(`Ошибка сохранения: ${detail || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to save act to Python DB:', error);
      alert('Не удалось связаться с Python сервером. Убедитесь, что main.py запущен.');
    }
  };

  const downloadDocx = async (act: Act) => {
    try {
      // Подготавливаем данные акта с изображениями из контекста, если они не заданы в самом акте
      const actWithImages = {
        ...act,
        signatureImage: act.signatureImage || signatureImage,
        stampImage: act.stampImage || stampImage
      };

      // Сначала пробуем скачать по ID (если акт уже в базе)
      const response = await fetch(`/api/acts/${act.id}/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actWithImages)
      });
      
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const blob = new Blob([arrayBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `act_${act.actNumber}.docx`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);
      } else {
        // Если по ID не нашли (акт еще не в базе), генерируем на лету
        console.log("Act not found in DB, generating on the fly...");
        const genResponse = await fetch('/api/generate-docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(actWithImages)
        });

        if (genResponse.ok) {
          const arrayBuffer = await genResponse.arrayBuffer();
          const blob = new Blob([arrayBuffer], { 
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
          });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `act_${act.actNumber}.docx`;
          document.body.appendChild(a);
          a.click();
          
          setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }, 100);
        } else {
          let errorMessage = 'Неизвестная ошибка';
          try {
            const errorData = await genResponse.json();
            errorMessage = typeof errorData.detail === 'string' 
              ? errorData.detail 
              : JSON.stringify(errorData.detail);
            console.error('Download error details:', errorData);
          } catch (e) {
            errorMessage = genResponse.statusText || errorMessage;
          }
          alert(`Ошибка скачивания: ${errorMessage}`);
        }
      }
    } catch (error) {
      console.error('Failed to download DOCX:', error);
      alert('Ошибка: Не удалось подключиться к серверу.');
    }
  };

  const setNextActNumber = (num: number) => {
    setNextActNumberState(num);
  };

  const setSignatureImage = (img: string | null) => {
    setSignatureImageState(img);
    if (img) {
      localStorage.setItem('signatureImage', img);
    } else {
      localStorage.removeItem('signatureImage');
    }
  };

  const setStampImage = (img: string | null) => {
    setStampImageState(img);
    if (img) {
      localStorage.setItem('stampImage', img);
    } else {
      localStorage.removeItem('stampImage');
    }
  };

  const setSpecification = (spec: SpecificationItem[]) => {
    setSpecificationState(spec);
  };

  return (
    <ActContext.Provider value={{ 
      acts, fetchActs, addAct, updateAct, deleteAct, saveActToDb, downloadDocx,
      nextActNumber, setNextActNumber,
      signatureImage, setSignatureImage,
      stampImage, setStampImage,
      specification, setSpecification,
      deleteAllActs
    }}>
      {children}
    </ActContext.Provider>
  );
}

export function useActContext() {
  const context = useContext(ActContext);
  if (!context) {
    throw new Error('useActContext must be used within an ActProvider');
  }
  return context;
}
