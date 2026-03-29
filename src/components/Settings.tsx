import React, { useState, useRef, useEffect } from 'react';
import { useActContext } from '../store/ActContext';
import { useUndo } from '../store/UndoContext';
import { Upload, Trash2, Download, Database, AlertTriangle } from 'lucide-react';
import { SpecificationSettings } from './SpecificationSettings';

export function Settings() {
  const { 
    nextActNumber, setNextActNumber,
    signatureImage, setSignatureImage,
    stampImage, setStampImage
  } = useActContext();
  const { pushAction } = useUndo();
  const [localNumber, setLocalNumber] = useState(nextActNumber.toString());
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [usageStats, setUsageStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const fetchUsageStats = async () => {
    try {
      setIsLoadingStats(true);
      const response = await fetch('/api/usage/stats');
      if (response.ok) {
        const data = await response.json();
        setUsageStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch usage stats:", err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchUsageStats();
  }, []);

  const handleSave = () => {
    const num = parseInt(localNumber, 10);
    if (!isNaN(num) && num > 0) {
      const oldNum = nextActNumber;
      setNextActNumber(num);
      pushAction(`Изменен номер следующего акта на ${num}`, async () => {
        setNextActNumber(oldNum);
        setLocalNumber(oldNum.toString());
      });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (img: string | null) => void, type: 'подпись' | 'печать') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const oldImg = type === 'подпись' ? signatureImage : stampImage;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setter(result);
      pushAction(`Загружена ${type}`, async () => {
        setter(oldImg);
      });
    };
    reader.readAsDataURL(file);
  };

  const handleExportBackup = async () => {
    try {
      setIsBackingUp(true);
      window.open('/api/backup/export', '_blank');
    } catch (err) {
      console.error("Backup error:", err);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("ВНИМАНИЕ: Загрузка резервной копии полностью заменит текущую базу данных. Все несохраненные данные будут потеряны. Продолжить?")) {
      if (backupInputRef.current) backupInputRef.current.value = '';
      return;
    }

    try {
      setIsRestoring(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/backup/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to restore backup');
      }

      alert("База данных успешно восстановлена!");
      window.location.reload(); // Simplest way to ensure all contexts are fresh
    } catch (err) {
      console.error("Restore error:", err);
      alert(`Ошибка при восстановлении: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsRestoring(false);
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm max-w-2xl">
        <h3 className="text-lg font-semibold border-b pb-2 mb-6">Настройки</h3>
      
      <div className="space-y-8">
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-4">Нумерация актов</h4>
          <label className="block text-sm font-medium text-gray-700">Следующий номер Акта</label>
          <div className="mt-1 flex rounded-md shadow-sm max-w-xs">
            <input
              type="number"
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value)}
              className="flex-1 block w-full rounded-none rounded-l-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            />
            <button
              onClick={handleSave}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Сохранить
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Здесь вы можете задать номер, с которого начнется нумерация следующих создаваемых актов.
          </p>
        </div>

        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">Резервное копирование</h4>
          <p className="text-sm text-gray-500 mb-4">
            Вы можете скачать полную копию базы данных (УПД, Акты, спецификации) или восстановить данные из ранее созданной копии.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleExportBackup}
              disabled={isBackingUp}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2 text-blue-500" />
              Скачать резервную копию (.db)
            </button>
            
            <input 
              type="file" 
              ref={backupInputRef}
              onChange={handleImportBackup} 
              accept=".db" 
              className="hidden" 
            />
            <button
              onClick={() => backupInputRef.current?.click()}
              disabled={isRestoring}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <Upload className="w-4 h-4 mr-2 text-green-500" />
              {isRestoring ? 'Восстановление...' : 'Восстановить из файла'}
            </button>
          </div>
        </div>

        <div className="border-t pt-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-md font-medium text-gray-900">Статистика использования Gemini API</h4>
            <button 
              onClick={fetchUsageStats}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
              disabled={isLoadingStats}
            >
              <Database className={`w-3 h-3 mr-1 ${isLoadingStats ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
          
          {usageStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <p className="text-[10px] text-blue-600 uppercase font-bold tracking-wider">Всего запросов</p>
                  <p className="text-xl font-bold text-blue-900">{usageStats.overall.total_requests || 0}</p>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <p className="text-[10px] text-indigo-600 uppercase font-bold tracking-wider">Токенов сегодня</p>
                  <p className="text-xl font-bold text-indigo-900">{usageStats.daily.tokens_today || 0}</p>
                  <p className="text-[10px] text-indigo-500 mt-1">Лимит: 1M / мин</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                  <p className="text-[10px] text-green-600 uppercase font-bold tracking-wider">Запросов сегодня</p>
                  <p className="text-xl font-bold text-green-900">{usageStats.daily.requests_today || 0}</p>
                  <p className="text-[10px] text-green-500 mt-1">Лимит: 1500 / день</p>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                  <p className="text-[10px] text-purple-600 uppercase font-bold tracking-wider">Всего токенов</p>
                  <p className="text-xl font-bold text-purple-900">{(usageStats.overall.total_tokens / 1000).toFixed(1)}k</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h5 className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">По типам действий</h5>
                <div className="space-y-2">
                  {usageStats.by_action.map((action: any) => (
                    <div key={action.action} className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">
                        {action.action === 'upd_extraction' ? 'Распознавание УПД' : 
                         action.action === 'spec_extraction' ? 'Распознавание спецификаций' : action.action}
                      </span>
                      <div className="text-right">
                        <span className="font-medium text-gray-900">{action.count} запр.</span>
                        <span className="text-gray-400 mx-2">|</span>
                        <span className="text-gray-600">{(action.tokens / 1000).toFixed(1)}k токенов</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {(usageStats.daily.requests_today > 1500 || usageStats.daily.tokens_today > 1000000) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mr-2 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800">Внимание: Превышение бесплатного порога</p>
                    <p className="text-[10px] text-amber-700">Вы превысили стандартные лимиты бесплатного уровня (1500 запр/день). Убедитесь, что у вас настроен платный аккаунт или проверьте квоты в Google Cloud Console.</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Загрузка статистики...</p>
          )}
        </div>

        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">Печать и подпись поставщика</h4>
          <p className="text-sm text-gray-500 mb-4">
            Загрузите изображения печати и подписи с прозрачным фоном (PNG), чтобы они автоматически добавлялись в печатную форму акта.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Signature Upload */}
            <div className="border rounded-lg p-4 flex flex-col items-center">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Подпись</h5>
              
              {signatureImage ? (
                <div className="relative w-full h-32 bg-gray-50 border border-dashed rounded-md flex items-center justify-center mb-4">
                  <img src={signatureImage} alt="Подпись" className="max-h-full max-w-full object-contain" />
                  <button 
                    onClick={() => {
                      const oldImg = signatureImage;
                      setSignatureImage(null);
                      pushAction('Удалена подпись', async () => {
                        setSignatureImage(oldImg);
                      });
                    }}
                    className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-32 bg-gray-50 border border-dashed rounded-md flex flex-col items-center justify-center mb-4 text-gray-400">
                  <Upload className="w-8 h-8 mb-2" />
                  <span className="text-xs">Нет изображения</span>
                </div>
              )}
              
              <input 
                type="file" 
                ref={signatureInputRef}
                onChange={(e) => handleImageUpload(e, setSignatureImage, 'подпись')} 
                accept="image/*" 
                className="hidden" 
              />
              <button
                onClick={() => signatureInputRef.current?.click()}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                {signatureImage ? 'Заменить подпись' : 'Загрузить подпись'}
              </button>
            </div>

            {/* Stamp Upload */}
            <div className="border rounded-lg p-4 flex flex-col items-center">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Печать</h5>
              
              {stampImage ? (
                <div className="relative w-full h-32 bg-gray-50 border border-dashed rounded-md flex items-center justify-center mb-4">
                  <img src={stampImage} alt="Печать" className="max-h-full max-w-full object-contain" />
                  <button 
                    onClick={() => {
                      const oldImg = stampImage;
                      setStampImage(null);
                      pushAction('Удалена печать', async () => {
                        setStampImage(oldImg);
                      });
                    }}
                    className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-32 bg-gray-50 border border-dashed rounded-md flex flex-col items-center justify-center mb-4 text-gray-400">
                  <Upload className="w-8 h-8 mb-2" />
                  <span className="text-xs">Нет изображения</span>
                </div>
              )}
              
              <input 
                type="file" 
                ref={stampInputRef}
                onChange={(e) => handleImageUpload(e, setStampImage, 'печать')} 
                accept="image/*" 
                className="hidden" 
              />
              <button
                onClick={() => stampInputRef.current?.click()}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                {stampImage ? 'Заменить печать' : 'Загрузить печать'}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
      
      <SpecificationSettings />
    </div>
  );
}
