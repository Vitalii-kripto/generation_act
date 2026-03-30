import React, { useState, useMemo, useRef } from 'react';
import { useUpdContext } from '../store/UpdContext';
import { useUndo } from '../store/UndoContext';
import { useActContext } from '../store/ActContext';
import { Download, Search, Trash2, CheckCircle, AlertTriangle, XCircle, FileText, Upload, Loader2, ChevronDown, ChevronUp, Paperclip, AlertCircle } from 'lucide-react';
import { UpdResponse, UpdCreate } from '../types';
import { extractDataFromUPD } from '../services/geminiService';
import { normalizeDate } from '../utils/dateUtils';
import { AttachmentsManager } from './AttachmentsManager';

export function UpdRegistry() {
  const { upds, loading, error, createUpd, deleteUpd, exportUpds, updateUpd, fetchUpds } = useUpdContext();
  const { acts } = useActContext();
  const { pushAction } = useUndo();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof UpdResponse>('updDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, resolve: (value: boolean) => void } | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const totalAmount = useMemo(() => upds.reduce((sum, upd) => sum + upd.totalAmount, 0), [upds]);
  const paidAmount = useMemo(() => upds.filter(u => u.isPaid).reduce((sum, upd) => sum + upd.totalAmount, 0), [upds]);
  const unpaidAmount = totalAmount - paidAmount;

  const customConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({ message, resolve });
    });
  };

  const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, status: string } | null>(null);
  const [uploadResults, setUploadResults] = useState<{ success: number, failed: string[] } | null>(null);
  const isMounted = useRef(true);

  React.useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsExtracting(true);
    setUploadProgress({ current: 0, total: files.length, status: 'Подготовка...' });
    setUploadResults(null);
    
    const failed: string[] = [];
    let successCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        if (!isMounted.current) {
          console.warn('Компонент размонтирован, прерываем загрузку.');
          break;
        }

        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length, status: `Обработка: ${file.name}` });
        
        // Delay to avoid rate limits (1 second between files)
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 1000));

        if (!isMounted.current) break;

        try {
          const base64String = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          
          if (!isMounted.current) break;

          // Retry logic for AI extraction
          let data = null;
          let retries = 2;
          let lastError: any = null;
          
          while (retries >= 0) {
            if (!isMounted.current) break;
            try {
              data = await extractDataFromUPD(base64String, file.type);
              break;
            } catch (err: any) {
              lastError = err;
              const errMsg = err instanceof Error ? err.message : String(err);
              
              // Если это ошибка прерывания (AbortError/Network), не делаем retry
              if (errMsg.includes('прерван') || errMsg.includes('aborted') || errMsg.includes('Failed to fetch')) {
                throw err;
              }

              if (retries === 0) throw err;
              retries--;
              setUploadProgress(prev => prev ? { ...prev, status: `Повтор (${2-retries}/2): ${file.name}` } : null);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }

          if (!isMounted.current) break;
          if (!data) throw new Error(lastError ? (lastError instanceof Error ? lastError.message : String(lastError)) : "Не удалось извлечь данные");
          
          // Проверка покупателя
          const customerName = (data.customerName || '').toLowerCase();
          const customerShortName = (data.customerShortName || '').toLowerCase();
          
          const isValidCustomer = 
            customerName.includes('тоннельстройкомплект') || 
            customerName.includes('тск') ||
            customerShortName.includes('тск');

          if (!isValidCustomer) {
            throw new Error(`Неверный покупатель: "${data.customerName || 'не определен'}". Должен быть АО "ТСК" или Акционерное общество «ТОННЕЛЬСТРОЙКОМПЛЕКТ»`);
          }
          
          const updToSave: UpdCreate = {
            id: crypto.randomUUID(),
            updNumber: data.updNumber || 'Б/Н',
            updDate: normalizeDate(data.updDate || ''),
            supplierName: data.supplierName || '',
            customerName: data.customerName || '',
            items: (data.items || []).map(item => ({
              id: crypto.randomUUID(),
              name: item.name || '',
              unit: item.unit || 'шт',
              quantity: item.quantity || 1,
              priceWithVat: item.priceWithVat || 0,
              totalWithVat: item.totalWithVat || 0,
              country: item.country || 'Россия',
              specNumber: null
            })),
            totalAmount: data.totalAmount || 0,
            vatAmount: data.vatAmount || 0,
            vatRate: data.vatRate || 20,
            source: file.name,
            isUsedInAct: false
          };
          
          try {
            const createdUpd = await createUpd(updToSave);
            successCount++;
            pushAction(`Загружен УПД №${createdUpd.updNumber}`, async () => {
              await deleteUpd(createdUpd.id);
            });
          } catch (err: any) {
            if (err.message.includes('уже существует')) {
              const overwrite = await customConfirm(`УПД №${updToSave.updNumber} от ${updToSave.updDate} уже существует. Перезаписать?`);
              if (!isMounted.current) break;
              if (overwrite) {
                const oldUpd = upds.find(u => u.updNumber === updToSave.updNumber && u.updDate === updToSave.updDate);
                const createdUpd = await createUpd(updToSave, true);
                successCount++;
                pushAction(`Перезаписан УПД №${createdUpd.updNumber}`, async () => {
                  if (oldUpd) {
                    await createUpd(oldUpd, true);
                  } else {
                    await deleteUpd(createdUpd.id);
                  }
                });
              } else {
                // User skipped, not a failure but not a success either
              }
            } else {
              throw err;
            }
          }
        } catch (err) {
          console.error(`Error processing file ${file.name}:`, err);
          failed.push(`${file.name}: ${err instanceof Error ? err.message : 'Ошибка'}`);
        }
      }

      if (isMounted.current) {
        setUploadResults({ success: successCount, failed });
      }
    } catch (err) {
      console.error("Critical upload error:", err);
    } finally {
      if (isMounted.current) {
        setIsExtracting(false);
        setUploadProgress(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleSort = (field: keyof UpdResponse) => {
    if (field === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const checkUpdUsedInOtherAct = (updNumber: string, updDate: string) => {
    if (!updNumber || !updDate) return false;
    const cleanNumber = updNumber.trim().toLowerCase();
    const cleanDate = normalizeDate(updDate);
    
    for (const a of acts) {
      if (a.updDetails && a.updDetails.length > 0) {
        if (a.updDetails.some(d => d.number.trim().toLowerCase() === cleanNumber && normalizeDate(d.date) === cleanDate)) {
          return true;
        }
      } else if (a.updNumber && a.updDate) {
        const numbers = a.updNumber.split(',').map(s => s.trim().toLowerCase());
        const dates = a.updDate.split(',').map(s => normalizeDate(s.trim()));
        const count = Math.min(numbers.length, dates.length);
        for (let i = 0; i < count; i++) {
          if (numbers[i] === cleanNumber && dates[i] === cleanDate) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const filteredAndSortedUpds = useMemo(() => {
    return upds
      .map(upd => ({
        ...upd,
        isUsedInAct: checkUpdUsedInOtherAct(upd.updNumber, upd.updDate)
      }))
      .filter(upd => {
        const searchLower = searchTerm.toLowerCase();
        return (
          upd.updNumber.toLowerCase().includes(searchLower) ||
          upd.supplierName.toLowerCase().includes(searchLower) ||
          upd.customerName.toLowerCase().includes(searchLower) ||
          upd.totalAmount.toString().includes(searchLower)
        );
      })
      .sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        if (sortField === 'updDate' || sortField === 'acceptanceDate' || sortField === 'paymentDate') {
          // Convert DD.MM.YYYY to YYYY-MM-DD for sorting
          const parseDate = (d: string) => {
            if (!d) return 0;
            const parts = d.split('.');
            if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
            return 0;
          };
          aVal = parseDate(a[sortField] as string) as any;
          bVal = parseDate(b[sortField] as string) as any;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [upds, searchTerm, sortField, sortDirection, acts]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'green': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'yellow': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'red': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return null;
    }
  };

  const getStatusRowClass = (status: string) => {
    switch (status) {
      case 'green': return 'bg-green-50 hover:bg-green-100';
      case 'yellow': return 'bg-yellow-50 hover:bg-yellow-100';
      case 'red': return 'bg-red-50 hover:bg-red-100';
      default: return 'hover:bg-gray-50';
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Загрузка реестра УПД...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Ошибка: {error}</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden relative">
      {confirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{confirmDialog.message}</h3>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => { confirmDialog.resolve(false); setConfirmDialog(null); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Пропустить
              </button>
              <button
                type="button"
                onClick={() => { confirmDialog.resolve(true); setConfirmDialog(null); }}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Перезаписать
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadResults && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Результаты загрузки</h3>
            <p className="text-sm text-gray-600 mb-4">
              Успешно загружено: <span className="font-bold text-green-600">{uploadResults.success}</span>
            </p>
            {uploadResults.failed.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-red-600 mb-1">Ошибки ({uploadResults.failed.length}):</p>
                <div className="max-h-40 overflow-y-auto bg-red-50 p-2 rounded text-xs text-red-700">
                  {uploadResults.failed.map((f, i) => <div key={i} className="mb-1">• {f}</div>)}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setUploadResults(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center">
          <FileText className="w-6 h-6 mr-2 text-blue-500" />
          Реестр УПД
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по УПД..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64"
            />
          </div>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload} 
            accept="application/pdf,image/*" 
            className="hidden" 
            multiple
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExtracting ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                {uploadProgress && (
                  <div className="flex flex-col items-center mt-0.5">
                    <span className="text-[10px] leading-none">
                      {uploadProgress.current}/{uploadProgress.total}
                    </span>
                    <span className="text-[8px] leading-none mt-0.5 opacity-75 max-w-[100px] truncate">
                      {uploadProgress.status}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <Upload className="w-5 h-5 mr-2" />
            )}
            {isExtracting ? '' : 'Загрузить УПД'}
          </button>
          <button
            onClick={exportUpds}
            className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-5 h-5 mr-2" />
            Экспорт в Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-gray-50 border-b border-gray-200">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Общая сумма отгрузок</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totalAmount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-green-200">
          <p className="text-sm text-green-600 font-medium">Сумма оплаченных УПД</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            {paidAmount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-red-200">
          <p className="text-sm text-red-600 font-medium">Сумма неоплаченных УПД</p>
          <p className="text-2xl font-bold text-red-700 mt-1">
            {unpaidAmount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('updNumber')}
              >
                Номер УПД
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('updDate')}
              >
                Дата УПД
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('totalAmount')}
              >
                Сумма
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Файлы
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Позиций
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('acceptanceDate')}
              >
                Дата приемки
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('paymentDate')}
              >
                Дата оплаты
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('isPaid')}
              >
                Оплачено
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                В акте
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedUpds.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  УПД не найдены
                </td>
              </tr>
            ) : (
              filteredAndSortedUpds.map((upd) => (
                <React.Fragment key={upd.id}>
                  <tr className={`transition-colors ${getStatusRowClass(upd.status)}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {upd.updNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {upd.updDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {upd.totalAmount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center text-gray-500">
                      <Paperclip className={`w-4 h-4 mr-1 ${upd.attachmentsCount && upd.attachmentsCount > 0 ? 'text-blue-500' : 'text-gray-300'}`} />
                      <span>{upd.attachmentsCount || 0}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {upd.items.length}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {upd.acceptanceDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {upd.paymentDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center" title={`Осталось дней: ${upd.daysUntilPayment}`}>
                      {upd.isPaid ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        getStatusIcon(upd.status)
                      )}
                      <span className="ml-2">
                        {upd.isPaid ? 'Оплачено' : (
                          <>
                            {upd.status === 'green' && 'В срок'}
                            {upd.status === 'yellow' && 'Скоро'}
                            {upd.status === 'red' && 'Просрочено'}
                          </>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                    <input
                      type="checkbox"
                      checked={upd.isPaid || false}
                      onChange={(e) => updateUpd(upd.id, { ...upd, isPaid: e.target.checked })}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {upd.isUsedInAct ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        Да
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        Нет
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => toggleRow(upd.id)}
                      className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-full transition-colors mr-2"
                      title={expandedRows.has(upd.id) ? "Скрыть детали" : "Показать детали"}
                    >
                      {expandedRows.has(upd.id) ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirmDelete === upd.id) {
                          deleteUpd(upd.id).then((deletedUpd) => {
                            if (deletedUpd) {
                              pushAction(`Удален УПД №${deletedUpd.updNumber}`, async () => {
                                await createUpd(deletedUpd);
                              });
                            }
                          }).catch(err => {
                            console.error('Error deleting UPD:', err);
                          });
                          setConfirmDelete(null);
                        } else {
                          setConfirmDelete(upd.id);
                          setTimeout(() => setConfirmDelete(prev => prev === upd.id ? null : prev), 3000);
                        }
                      }}
                      className={`${confirmDelete === upd.id ? 'text-white bg-red-600 px-2 py-1 rounded animate-pulse' : 'text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-full transition-colors'}`}
                      title={confirmDelete === upd.id ? "Нажмите еще раз для подтверждения" : "Удалить УПД"}
                    >
                      {confirmDelete === upd.id ? (
                        <span className="flex items-center text-xs font-bold">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          УДАЛИТЬ?
                        </span>
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                </tr>
                {expandedRows.has(upd.id) && (
                  <tr>
                    <td colSpan={11} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <AttachmentsManager 
                        entityType="upd" 
                        entityId={upd.id} 
                        onAttachmentsChange={fetchUpds}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
