import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
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

interface SyncedSettings {
  specification?: string;
  nextActNumber?: number;
  signatureImage?: string | null;
  stampImage?: string | null;
}

const ActContext = createContext<ActContextType | undefined>(undefined);

export function ActProvider({ children }: { children: ReactNode }) {
  const [acts, setActs] = useState<Act[]>([]);
  const [specification, setSpecificationState] = useState<SpecificationItem[]>(() => {
    try {
      const saved = localStorage.getItem('specification');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [nextActNumber, setNextActNumberState] = useState<number>(() => {
    const saved = localStorage.getItem('nextActNumber');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [signatureImage, setSignatureImageState] = useState<string | null>(() => {
    return localStorage.getItem('signatureImage');
  });
  const [stampImage, setStampImageState] = useState<string | null>(() => {
    return localStorage.getItem('stampImage');
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const lastSyncedRef = useRef<SyncedSettings>((() => {
    // Initialize ref with current localStorage values to prevent immediate sync if they match
    const spec = localStorage.getItem('specification') || '[]';
    const num = parseInt(localStorage.getItem('nextActNumber') || '1', 10);
    const sig = localStorage.getItem('signatureImage');
    const stamp = localStorage.getItem('stampImage');
    return {
      specification: spec,
      nextActNumber: num,
      signatureImage: sig,
      stampImage: stamp
    };
  })());

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          console.log('Settings loaded from backend:', data);
          
          if (data.specification) {
            const loadedSpec = typeof data.specification === 'string' ? JSON.parse(data.specification) : data.specification;
            setSpecificationState(loadedSpec);
          } else {
            const savedSpec = localStorage.getItem('specification');
            if (savedSpec) setSpecificationState(JSON.parse(savedSpec));
          }

          if (data.nextActNumber) {
            setNextActNumberState(parseInt(data.nextActNumber, 10));
          } else {
            const savedNum = localStorage.getItem('nextActNumber');
            if (savedNum) setNextActNumberState(parseInt(savedNum, 10));
          }

          if (data.signatureImage) {
            setSignatureImageState(data.signatureImage);
          } else {
            const savedSig = localStorage.getItem('signatureImage');
            if (savedSig) setSignatureImageState(savedSig);
          }

          if (data.stampImage) {
            setStampImageState(data.stampImage);
          } else {
            const savedStamp = localStorage.getItem('stampImage');
            if (savedStamp) setStampImageState(savedStamp);
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings from backend:', error);
        // Fallback to localStorage on error
        try {
          const savedSpec = localStorage.getItem('specification');
          if (savedSpec) setSpecificationState(JSON.parse(savedSpec));
          const savedNum = localStorage.getItem('nextActNumber');
          if (savedNum) setNextActNumberState(parseInt(savedNum, 10));
          const savedSig = localStorage.getItem('signatureImage');
          if (savedSig) setSignatureImageState(savedSig);
          const savedStamp = localStorage.getItem('stampImage');
          if (savedStamp) setStampImageState(savedStamp);
        } catch (e) {}
      } finally {
        setIsInitialized(true);
      }
    };

    loadSettings();
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
      
      if (nextActNumber !== lastSyncedRef.current.nextActNumber) {
        console.log('Syncing nextActNumber to backend:', nextActNumber);
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nextActNumber })
        })
        .then(() => {
          lastSyncedRef.current.nextActNumber = nextActNumber;
        })
        .catch(console.error);
      }
    }
  }, [nextActNumber, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      const specJson = JSON.stringify(specification);
      localStorage.setItem('specification', specJson);
      
      if (specJson !== lastSyncedRef.current.specification) {
        console.log('Syncing specification to backend:', specification.length, 'items');
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specification })
        })
        .then(() => {
          lastSyncedRef.current.specification = specJson;
        })
        .catch(console.error);
      }
    }
  }, [specification, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      if (signatureImage) {
        localStorage.setItem('signatureImage', signatureImage);
      } else {
        localStorage.removeItem('signatureImage');
      }
      
      if (signatureImage !== lastSyncedRef.current.signatureImage) {
        console.log('Syncing signatureImage to backend');
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signatureImage })
        })
        .then(() => {
          lastSyncedRef.current.signatureImage = signatureImage;
        })
        .catch(console.error);
      }
    }
  }, [signatureImage, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      if (stampImage) {
        localStorage.setItem('stampImage', stampImage);
      } else {
        localStorage.removeItem('stampImage');
      }
      
      if (stampImage !== lastSyncedRef.current.stampImage) {
        console.log('Syncing stampImage to backend');
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stampImage })
        })
        .then(() => {
          lastSyncedRef.current.stampImage = stampImage;
        })
        .catch(console.error);
      }
    }
  }, [stampImage, isInitialized]);

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
  };

  const setStampImage = (img: string | null) => {
    setStampImageState(img);
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
