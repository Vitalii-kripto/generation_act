import React, { useState, useRef, useEffect } from 'react';
import { useActContext } from '../store/ActContext';
import { useUpdContext } from '../store/UpdContext';
import { useUndo } from '../store/UndoContext';
import { Act, ActItem, SpecificationItem, UpdResponse } from '../types';
import { Plus, Trash2, Upload, Loader2, AlertTriangle, Database, FileText } from 'lucide-react';
import { extractDataFromUPD } from '../services/geminiService';
import { normalizeDate } from '../utils/dateUtils';
import { AttachmentsManager } from './AttachmentsManager';

export function CreateAct({ onCreated, initialAct, onUpdate }: { onCreated?: (act: Act) => void, initialAct?: Act, onUpdate?: (act: Act) => void }) {
  const { nextActNumber, addAct, specification, saveActToDb, acts, deleteAct } = useActContext();
  const { createUpd, upds, fetchUpds } = useUpdContext();
  const { pushAction } = useUndo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [showUpdSelector, setShowUpdSelector] = useState(false);
  const [selectedUpdIds, setSelectedUpdIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, resolve: (value: boolean) => void, isAlert?: boolean } | null>(null);

  const customConfirm = (message: string, isAlert: boolean = false): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({ message, resolve, isAlert });
    });
  };

  const checkUpdUsedInOtherAct = (updNumber: string, updDate: string) => {
    if (!updNumber || !updDate) return null;
    const cleanNumber = updNumber.trim().toLowerCase();
    const cleanDate = normalizeDate(updDate);
    
    for (const a of acts) {
      // Skip the current act if we are editing
      if (initialAct && a.id === initialAct.id) continue;
      
      if (a.updDetails && a.updDetails.length > 0) {
        if (a.updDetails.some(d => d.number.trim().toLowerCase() === cleanNumber && normalizeDate(d.date) === cleanDate)) {
          return a.actNumber;
        }
      } else if (a.updNumber && a.updDate) {
        const numbers = a.updNumber.split(',').map(s => s.trim().toLowerCase());
        const dates = a.updDate.split(',').map(s => normalizeDate(s.trim()));
        const count = Math.min(numbers.length, dates.length);
        for (let i = 0; i < count; i++) {
          if (numbers[i] === cleanNumber && dates[i] === cleanDate) {
            return a.actNumber;
          }
        }
      }
    }
    return null;
  };

  // Extract unique values for autocomplete
  const uniqueObjects = Array.from(new Set(acts.map(a => a.objectName).filter(Boolean)));
  const uniqueCustomerReps = Array.from(new Set(acts.map(a => a.customerRep).filter(Boolean)));
  const uniqueCustomerRepShorts = Array.from(new Set(acts.map(a => a.customerRepShort).filter(Boolean)));
  const uniqueSupplierReps = Array.from(new Set(acts.map(a => a.supplierRep).filter(Boolean)));
  const uniqueSupplierRepShorts = Array.from(new Set(acts.map(a => a.supplierRepShort).filter(Boolean)));

  const matchWithSpecification = (item: Partial<ActItem>, overrideName: boolean = false, strict: boolean = false): Partial<ActItem> | null => {
    if (!item.name || !specification.length) return strict ? null : item;
    
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    const itemWords = normalize(item.name);

    let bestMatch = null;
    let bestScore = 0;

    for (const spec of specification) {
      const specWords = normalize(spec.name);
      let matches = 0;
      for (const w1 of itemWords) {
        if (specWords.some(w2 => w1 === w2 || (w1.length > 3 && w2.includes(w1)) || (w2.length > 3 && w1.includes(w2)))) {
          matches++;
        }
      }
      const score = matches / Math.max(itemWords.length, specWords.length);
      
      const isIncluded = item.name.toLowerCase().includes(spec.name.toLowerCase()) || 
                         spec.name.toLowerCase().includes(item.name.toLowerCase());
                         
      const finalScore = isIncluded ? 1 : score;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMatch = spec;
      }
    }

    if (bestMatch && bestScore > 0.5) {
      const priceMismatch = item.priceWithVat !== undefined && 
                            Math.abs(item.priceWithVat - bestMatch.priceWithVat) > 0.01;
      return {
        ...item,
        name: overrideName ? bestMatch.name : item.name,
        specNumber: bestMatch.specNumber,
        priceMismatch
      };
    }
    
    return strict ? null : { ...item, specNumber: '', priceMismatch: false };
  };

  const [act, setAct] = useState<Act>(initialAct || {
    id: crypto.randomUUID(),
    actNumber: nextActNumber,
    actDate: new Date().toLocaleDateString('ru-RU'),
    contractNumber: 'ТСК-З/544',
    contractDate: '22.12.2025',
    updNumber: 'УТ-199',
    updDate: '05.03.2026',
    supplierName: 'Общество с ограниченной ответственностью «ГИДРОИЗОЛ-СПБ»',
    supplierRep: 'генерального директора Черноусовой Кристины Сергеевны',
    supplierBasis: 'Устава',
    supplierShortName: 'ООО «ГИДРОИЗОЛ-СПБ»',
    supplierRepShort: 'К.С. Черноусова',
    customerName: 'Акционерное общество «ТОННЕЛЬСТРОЙКОМПЛЕКТ»',
    customerRep: 'Старшего менеджера Минаевой Олеси Николаевны',
    customerBasis: 'доверенности № ТСК-Д/62 от 23.12.2025 г',
    customerShortName: 'АО «ТСК»',
    customerRepShort: 'Минаева О.Н.',
    items: [
      matchWithSpecification({
        id: crypto.randomUUID(),
        name: 'Рубитэкс ЭПП-5,0 10м2 (23рул/палл)',
        unit: 'М2',
        quantity: 3910,
        priceWithVat: 371.91,
        totalWithVat: 1454168.10,
        country: 'Россия'
      }, true) as ActItem
    ],
    totalAmount: 1454168.10,
    vatAmount: 262227.03,
    vatRate: 22,
    objectName: 'Рублево-Архангельская линия перегон ст. "Строгино"-ст."Липовая Роща"',
    deliveryTerm: 'в течение 2 (двух) рабочих дней',
    actualDeliveryDate: '05.03.2026',
    expertise: '',
    penalty: 'Неустойка Поставщику не начисляется.'
  });

  // Re-evaluate specification matches when specification changes
  useEffect(() => {
    setAct(prev => ({
      ...prev,
      items: prev.items.map(item => (matchWithSpecification(item, true) || item) as ActItem)
    }));
  }, [specification]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAct(prev => ({ ...prev, [name]: value }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (['actDate', 'contractDate', 'updDate', 'actualDeliveryDate'].includes(name)) {
      if ((name === 'actualDeliveryDate' || name === 'updDate') && value.includes(',')) {
        // Do not normalize if it's a list of dates
        return;
      }
      setAct(prev => ({ ...prev, [name]: normalizeDate(value) }));
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAct(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handleItemChange = (id: string, field: keyof ActItem, value: string | number | boolean) => {
    setAct(prev => {
      const newItems = prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'quantity' || field === 'priceWithVat') {
            updatedItem.totalWithVat = updatedItem.quantity * updatedItem.priceWithVat;
          }
          return updatedItem;
        }
        return item;
      });
      
      const totalAmount = newItems.reduce((sum, item) => sum + item.totalWithVat, 0);
      const vatAmount = totalAmount * (prev.vatRate / (100 + prev.vatRate));

      return { ...prev, items: newItems, totalAmount, vatAmount };
    });
  };

  const addItem = () => {
    setAct(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: crypto.randomUUID(),
          name: '',
          unit: 'шт',
          quantity: 1,
          priceWithVat: 0,
          totalWithVat: 0,
          country: 'Россия'
        }
      ]
    }));
  };

  const removeItem = (id: string) => {
    setAct(prev => {
      const newItems = prev.items.filter(item => item.id !== id);
      const totalAmount = newItems.reduce((sum, item) => sum + item.totalWithVat, 0);
      const vatAmount = totalAmount * (prev.vatRate / (100 + prev.vatRate));
      return { ...prev, items: newItems, totalAmount, vatAmount };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if any UPD is already used
    let hasConflict = false;
    if (act.updDetails && act.updDetails.length > 0) {
      for (const detail of act.updDetails) {
        const usedInActNumber = checkUpdUsedInOtherAct(detail.number, detail.date);
        if (usedInActNumber) {
          await customConfirm(`УПД №${detail.number} от ${detail.date} уже используется в Акте №${usedInActNumber}. Один и тот же УПД не может использоваться в разных Актах одновременно.`, true);
          hasConflict = true;
          break;
        }
      }
    } else if (act.updNumber && act.updDate) {
      const numbers = act.updNumber.split(',').map(s => s.trim());
      const dates = act.updDate.split(',').map(s => s.trim());
      const count = Math.min(numbers.length, dates.length);
      for (let i = 0; i < count; i++) {
        const usedInActNumber = checkUpdUsedInOtherAct(numbers[i], dates[i]);
        if (usedInActNumber) {
          await customConfirm(`УПД №${numbers[i]} от ${dates[i]} уже используется в Акте №${usedInActNumber}. Один и тот же УПД не может использоваться в разных Актах одновременно.`, true);
          hasConflict = true;
          break;
        }
      }
    }

    if (hasConflict) {
      return;
    }

    if (initialAct && onUpdate) {
      const oldAct = { ...initialAct };
      await saveActToDb(act);
      await fetchUpds();
      onUpdate(act);
      pushAction(`Обновлен Акт №${act.actNumber}`, async () => {
        await saveActToDb(oldAct);
        onUpdate(oldAct);
      });
    } else if (onCreated) {
      addAct(act);
      await saveActToDb(act);
      await fetchUpds();
      onCreated(act);
      pushAction(`Создан Акт №${act.actNumber}`, async () => {
        await deleteAct(act.id);
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsExtracting(true);
    setMatchError(null);
    
    try {
      const allExtractedData = [];
      const extractionErrors: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64String = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        
        try {
          const data = await extractDataFromUPD(base64String, file.type);
          
          const updToSave = {
            id: crypto.randomUUID(),
            updNumber: data.updNumber || '',
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
            await createUpd(updToSave);
          } catch (err: any) {
            if (err.message.includes('уже существует')) {
              const overwrite = await customConfirm(`УПД №${updToSave.updNumber} от ${updToSave.updDate} уже существует в реестре. Перезаписать?`);
              if (overwrite) {
                await createUpd(updToSave, true);
              } else {
                continue; // Skip this file
              }
            } else {
              console.error("Failed to save UPD to registry:", err);

              await fetch("/api/frontend-log", {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({
                  level: "error",
                  source: "CreateAct",
                  message: "Не удалось сохранить извлеченный УПД в реестр",
                  context: {
                    fileName: file.name,
                    updNumber: updToSave.updNumber,
                    updDate: updToSave.updDate,
                    error: err instanceof Error ? err.message : String(err),
                  },
                }),
              });
            }
          }
          
          allExtractedData.push(data);
        } catch (err) {
          const rawErrorMessage =
            err instanceof Error ? err.message : "Неизвестная ошибка извлечения";

          const userFriendlyMessage =
            rawErrorMessage.includes("503") || rawErrorMessage.includes("UNAVAILABLE")
              ? "Сервис Gemini временно перегружен. Выполнены повторные попытки и переключение на резервную модель gemini-3.1-flash-lite-preview. Повторите загрузку через 10–30 секунд."
              : rawErrorMessage;

          extractionErrors.push(`${file.name}: ${userFriendlyMessage}`);
          console.error(`Error extracting from file ${file.name}:`, err);

          await fetch("/api/frontend-log", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              level: "error",
              source: "CreateAct",
              message: "Ошибка извлечения данных из файла УПД",
              context: {
                fileName: file.name,
                mimeType: file.type,
                error: rawErrorMessage,
              },
            }),
          });
        }
      }

      if (allExtractedData.length === 0) {
        const message =
          extractionErrors.length > 0
            ? "Не удалось извлечь данные ни из одного файла:\n\n" + extractionErrors.join("\n")
            : "Не удалось извлечь данные ни из одного файла.";

        alert(message);
        return;
      }

      await applySelectedUpds(allExtractedData as UpdResponse[]);
      
      if (extractionErrors.length > 0) {
        alert(
          "Часть файлов обработана, но по некоторым возникли ошибки:\n\n" +
            extractionErrors.join("\n")
        );
      }
      
    } catch (err) {
      console.error("Aggregation error:", err);
      alert("Ошибка при обработке файлов.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeUpd = (indexToRemove: number) => {
    setAct(prev => {
      if (!prev.updDetails) return prev;
      
      const newUpdDetails = prev.updDetails.filter((_, i) => i !== indexToRemove);
      
      // If no UPDs left, clear items and amounts
      if (newUpdDetails.length === 0) {
        return {
          ...prev,
          updDetails: [],
          updNumber: '',
          updDate: '',
          items: [],
          totalAmount: 0,
          vatAmount: 0
        };
      }

      // Recalculate everything based on remaining UPDs
      let aggregatedItems: ActItem[] = [];
      let totalAmount = 0;
      let vatAmount = 0;
      let updNumbers: string[] = [];
      let updDates: string[] = [];

      newUpdDetails.forEach(detail => {
        updNumbers.push(detail.number);
        updDates.push(detail.date);
        
        // Find the full UPD data from registry
        const fullUpd = upds.find(u => u.updNumber === detail.number && u.updDate === detail.date);
        
        if (fullUpd) {
          totalAmount += fullUpd.totalAmount;
          vatAmount += fullUpd.vatAmount;
          
          if (fullUpd.items?.length) {
            for (const item of fullUpd.items) {
              // Try to match with specification
              const matched = matchWithSpecification({
                id: crypto.randomUUID(),
                name: item.name || '',
                unit: item.unit || 'шт',
                quantity: item.quantity || 1,
                priceWithVat: item.priceWithVat || 0,
                totalWithVat: item.totalWithVat || 0,
                country: item.country || 'Россия'
              }, true, false); // strict=false to keep the item even if no match
              
              if (matched) {
                const existingItem = aggregatedItems.find(i => i.name === matched.name && Math.abs(i.priceWithVat - (matched.priceWithVat || 0)) < 0.01);
                if (existingItem) {
                  existingItem.quantity += matched.quantity || 0;
                  existingItem.totalWithVat += matched.totalWithVat || 0;
                } else {
                  aggregatedItems.push(matched as ActItem);
                }
              }
            }
          }
        } else {
          totalAmount += detail.amount;
          vatAmount += detail.amount * 0.2; // Assuming 20% VAT as fallback
        }
      });

      return {
        ...prev,
        updDetails: newUpdDetails,
        updNumber: updNumbers.join(', '),
        updDate: updDates.join(', '),
        actualDeliveryDate: Array.from(new Set(updDates.map(d => normalizeDate(d)))).join(', '),
        items: aggregatedItems,
        totalAmount,
        vatAmount
      };
    });
  };

  const applySelectedUpds = async (selectedUpds: UpdResponse[]) => {
    if (selectedUpds.length === 0) return;
    
    let aggregatedItems: ActItem[] = act.items.map(item => ({ ...item }));
    let unmatchedNames: string[] = [];
    let totalAmount = act.totalAmount || 0;
    let vatAmount = act.vatAmount || 0;
    let updNumbers: string[] = act.updNumber ? act.updNumber.split(', ').filter(Boolean) : [];
    let updDates: string[] = act.updDate ? act.updDate.split(', ').filter(Boolean) : [];
    let updDetails: { number: string; date: string; amount: number }[] = act.updDetails ? [...act.updDetails] : [];

    // Clear default form values if this is the first UPD being added to a new act
    if (!initialAct && updDetails.length === 0) {
      aggregatedItems = [];
      totalAmount = 0;
      vatAmount = 0;
      updNumbers = [];
      updDates = [];
    }

    for (const data of selectedUpds) {
      const currentUpdNumber = data.updNumber || '';
      const currentUpdDate = data.updDate || '';
      const currentUpdAmount = data.totalAmount || 0;

      // Check if used in another act
      const usedInActNumber = checkUpdUsedInOtherAct(currentUpdNumber, currentUpdDate);
      if (usedInActNumber) {
        await customConfirm(`УПД №${currentUpdNumber} от ${currentUpdDate} уже используется в Акте №${usedInActNumber}. Один и тот же УПД не может использоваться в разных Актах одновременно.`, true);
        continue;
      }

      // Skip if already added
      if (updDetails.some(d => d.number === currentUpdNumber && d.date === currentUpdDate)) {
        continue;
      }

      if (currentUpdNumber) updNumbers.push(currentUpdNumber);
      if (currentUpdDate) updDates.push(currentUpdDate);
      
      updDetails.push({
        number: currentUpdNumber,
        date: currentUpdDate,
        amount: currentUpdAmount
      });

      if (data.totalAmount) totalAmount += data.totalAmount;
      if (data.vatAmount) vatAmount += data.vatAmount;

      if (data.items?.length) {
        for (const item of data.items) {
          // Try to match with specification
          const matched = matchWithSpecification({
            id: crypto.randomUUID(),
            name: item.name || '',
            unit: item.unit || 'шт',
            quantity: item.quantity || 1,
            priceWithVat: item.priceWithVat || 0,
            totalWithVat: item.totalWithVat || 0,
            country: item.country || 'Россия'
          }, true, false); // strict=false to keep the item even if no match
          
          if (matched) {
            // Check if it matched a spec item
            if (!matched.specNumber) {
              unmatchedNames.push(item.name || 'Неизвестная позиция');
            }

            const existingItem = aggregatedItems.find(i => i.name === matched.name && Math.abs(i.priceWithVat - (matched.priceWithVat || 0)) < 0.01);
            if (existingItem) {
              existingItem.quantity += matched.quantity || 0;
              existingItem.totalWithVat += matched.totalWithVat || 0;
            } else {
              aggregatedItems.push(matched as ActItem);
            }
          }
        }
      }
    }

    if (updDetails.length === 0) {
      setShowUpdSelector(false);
      return;
    }

    if (unmatchedNames.length > 0) {
      setMatchError(`Не удалось найти следующие позиции в спецификации: ${Array.from(new Set(unmatchedNames)).join('; ')}`);
    }

    const firstData = selectedUpds[0];

    setAct(prev => ({
      ...prev,
      updNumber: updNumbers.join(', '),
      updDate: updDates.map(d => normalizeDate(d)).join(', '),
      updDetails: updDetails.map(d => ({ ...d, date: normalizeDate(d.date) })),
      actDate: normalizeDate(updDates[updDates.length - 1]) || prev.actDate,
      actualDeliveryDate: updDates.length > 0 ? Array.from(new Set(updDates.map(d => normalizeDate(d)))).join(', ') : prev.actualDeliveryDate,
      supplierName: firstData.supplierName || prev.supplierName,
      customerName: firstData.customerName || prev.customerName,
      items: aggregatedItems.length > 0 ? aggregatedItems : prev.items,
      totalAmount: totalAmount || prev.totalAmount,
      vatAmount: vatAmount || prev.vatAmount,
      vatRate: firstData.vatRate || prev.vatRate,
    }));
    
    setShowUpdSelector(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-white p-6 rounded-xl shadow-sm">
      {confirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{confirmDialog.message}</h3>
            <div className="flex justify-end space-x-3">
              {!confirmDialog.isAlert && (
                <button
                  type="button"
                  onClick={() => { confirmDialog.resolve(false); setConfirmDialog(null); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Отмена
                </button>
              )}
              <button
                type="button"
                onClick={() => { confirmDialog.resolve(true); setConfirmDialog(null); }}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                {confirmDialog.isAlert ? 'ОК' : 'Перезаписать'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showUpdSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-900">Выбрать УПД из реестра</h3>
              <button type="button" onClick={() => { setShowUpdSelector(false); setSelectedUpdIds([]); }} className="text-gray-500 hover:text-gray-700">
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {upds.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Реестр УПД пуст</p>
              ) : (
                <div className="space-y-4">
                  {upds.map(upd => {
                    const isSelected = selectedUpdIds.includes(upd.id);
                    const isAlreadyAdded = act.updDetails?.some(d => d.number === upd.updNumber && d.date === upd.updDate);
                    return (
                      <div key={upd.id} className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : isAlreadyAdded ? 'border-gray-200 bg-gray-100 opacity-60' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isAlreadyAdded}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUpdIds(prev => [...prev, upd.id]);
                              } else {
                                setSelectedUpdIds(prev => prev.filter(id => id !== upd.id));
                              }
                            }}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-4 disabled:opacity-50"
                          />
                          <div>
                            <p className="font-medium text-gray-900">УПД №{upd.updNumber} от {upd.updDate}</p>
                            <p className="text-sm text-gray-500">{upd.supplierName}</p>
                            <p className="text-sm font-medium mt-1">{upd.totalAmount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</p>
                          </div>
                        </div>
                        {isAlreadyAdded && (
                          <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded">Уже добавлен</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowUpdSelector(false); setSelectedUpdIds([]); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  const selected = upds.filter(u => selectedUpdIds.includes(u.id));
                  applySelectedUpds(selected);
                  setSelectedUpdIds([]);
                }}
                disabled={selectedUpdIds.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Добавить выбранные ({selectedUpdIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 p-6 rounded-lg border border-blue-100 flex flex-col items-center justify-center text-center">
        <h3 className="text-lg font-medium text-blue-900 mb-2">{initialAct ? 'Обновление данных из УПД' : 'Автоматическое заполнение из нескольких УПД'}</h3>
        <p className="text-sm text-blue-700 mb-4 max-w-md">Выберите один или несколько файлов УПД (PDF или изображения). Мы объединим все товары в один акт.</p>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload} 
          accept="application/pdf,image/*" 
          className="hidden" 
          multiple
        />
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setShowUpdSelector(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Database className="w-5 h-5 mr-2" />
            Выбрать из реестра
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Распознавание...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Загрузить УПД
              </>
            )}
          </button>
        </div>
      </div>

      {act.updDetails && act.updDetails.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Привязанные УПД:</h4>
          <div className="space-y-2">
            {act.updDetails.map((upd, index) => (
              <div key={index} className="flex items-center justify-between bg-white p-3 rounded border border-gray-100 shadow-sm">
                <div className="flex items-center">
                  <FileText className="w-4 h-4 text-blue-500 mr-2" />
                  <span className="text-sm font-medium text-gray-900">УПД №{upd.number} от {upd.date}</span>
                  <span className="ml-4 text-sm text-gray-500">{upd.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeUpd(index)}
                  className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                  title="Удалить УПД"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {matchError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start">
          <AlertTriangle className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700">
            <p className="font-medium mb-1">Внимание: некоторые позиции из УПД не найдены в спецификации!</p>
            <p>{matchError}</p>
            <p className="mt-2 text-xs opacity-80">Эти позиции не были добавлены в акт. Проверьте правильность загруженной спецификации в настройках.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Основные данные</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Номер Акта</label>
              <input type="number" name="actNumber" value={act.actNumber} onChange={handleNumberChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Дата Акта</label>
              <input type="text" name="actDate" value={act.actDate} onChange={handleChange} onBlur={handleBlur} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Номер Договора</label>
              <input type="text" name="contractNumber" value={act.contractNumber} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Дата Договора</label>
              <input type="text" name="contractDate" value={act.contractDate} onChange={handleChange} onBlur={handleBlur} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Номер УПД</label>
              <input type="text" name="updNumber" value={act.updNumber} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Дата УПД</label>
              <input type="text" name="updDate" value={act.updDate} onChange={handleChange} onBlur={handleBlur} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Дополнительно</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700">Объект</label>
            <input 
              type="text" 
              name="objectName" 
              value={act.objectName} 
              onChange={handleChange} 
              list="objects-list"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
              required 
            />
            <datalist id="objects-list">
              {uniqueObjects.map((obj, i) => <option key={i} value={obj} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Срок по договору</label>
              <input type="text" name="deliveryTerm" value={act.deliveryTerm} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Факт. срок</label>
              <input type="text" name="actualDeliveryDate" value={act.actualDeliveryDate} onChange={handleChange} onBlur={handleBlur} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Экспертиза</label>
            <input type="text" name="expertise" value={act.expertise} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Неустойка</label>
            <input type="text" name="penalty" value={act.penalty} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Заказчик</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700">Полное наименование</label>
            <input type="text" name="customerName" value={act.customerName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Краткое наименование</label>
              <input type="text" name="customerShortName" value={act.customerShortName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">В лице (должность, ФИО)</label>
              <input 
                type="text" 
                name="customerRep" 
                value={act.customerRep} 
                onChange={handleChange} 
                list="customer-reps-list"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                required 
              />
              <datalist id="customer-reps-list">
                {uniqueCustomerReps.map((rep, i) => <option key={i} value={rep} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Действует на основании</label>
              <input type="text" name="customerBasis" value={act.customerBasis} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Подписант (ФИО кратко)</label>
              <input 
                type="text" 
                name="customerRepShort" 
                value={act.customerRepShort} 
                onChange={handleChange} 
                list="customer-rep-shorts-list"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                required 
              />
              <datalist id="customer-rep-shorts-list">
                {uniqueCustomerRepShorts.map((rep, i) => <option key={i} value={rep} />)}
              </datalist>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Поставщик</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700">Полное наименование</label>
            <input type="text" name="supplierName" value={act.supplierName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Краткое наименование</label>
              <input type="text" name="supplierShortName" value={act.supplierShortName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">В лице (должность, ФИО)</label>
              <input 
                type="text" 
                name="supplierRep" 
                value={act.supplierRep} 
                onChange={handleChange} 
                list="supplier-reps-list"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                required 
              />
              <datalist id="supplier-reps-list">
                {uniqueSupplierReps.map((rep, i) => <option key={i} value={rep} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Действует на основании</label>
              <input type="text" name="supplierBasis" value={act.supplierBasis} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Подписант (ФИО кратко)</label>
              <input 
                type="text" 
                name="supplierRepShort" 
                value={act.supplierRepShort} 
                onChange={handleChange} 
                list="supplier-rep-shorts-list"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                required 
              />
              <datalist id="supplier-rep-shorts-list">
                {uniqueSupplierRepShorts.map((rep, i) => <option key={i} value={rep} />)}
              </datalist>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="text-lg font-semibold">Товары / Услуги</h3>
          <button type="button" onClick={addItem} className="flex items-center text-sm text-blue-600 hover:text-blue-800">
            <Plus className="w-4 h-4 mr-1" /> Добавить позицию
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">№ спец.</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Наименование</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Ед.изм.</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Кол-во</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Цена (с НДС)</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Сумма (с НДС)</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Страна</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {act.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input type="text" value={item.specNumber || ''} onChange={(e) => handleItemChange(item.id, 'specNumber', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border text-center" placeholder="-" />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input type="text" value={item.name} onChange={(e) => {
                      const updated = matchWithSpecification({ ...item, name: e.target.value }, false, false);
                      handleItemChange(item.id, 'name', updated?.name || e.target.value);
                      if (updated?.specNumber !== undefined) handleItemChange(item.id, 'specNumber', updated.specNumber);
                      if (updated?.priceMismatch !== undefined) handleItemChange(item.id, 'priceMismatch', updated.priceMismatch as any);
                    }} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border" required />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input type="text" value={item.unit} onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border" required />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input type="number" step="0.001" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border" required />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap relative">
                    <div className="flex items-center">
                      <input type="number" step="0.01" value={item.priceWithVat} onChange={(e) => {
                        const newPrice = parseFloat(e.target.value) || 0;
                        const updated = matchWithSpecification({ ...item, priceWithVat: newPrice }, false, false);
                        handleItemChange(item.id, 'priceWithVat', newPrice);
                        if (updated?.priceMismatch !== undefined) handleItemChange(item.id, 'priceMismatch', updated.priceMismatch as any);
                      }} className={`block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border ${item.priceMismatch ? 'border-red-500 text-red-900 bg-red-50' : 'border-gray-300'}`} required />
                      {item.priceMismatch && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 group">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                            Цена не совпадает со спецификацией
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-sm text-gray-900">{item.totalWithVat.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input type="text" value={item.country} onChange={(e) => handleItemChange(item.id, 'country', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border" required />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                    <button type="button" onClick={() => removeItem(item.id)} className="text-red-600 hover:text-red-900">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="flex justify-end space-x-4 mt-4">
          <div className="text-right">
            <p className="text-sm text-gray-500">Ставка НДС: <input type="number" name="vatRate" value={act.vatRate} onChange={handleNumberChange} className="w-16 ml-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border text-right" /> %</p>
            <p className="text-sm text-gray-500 mt-1">В том числе НДС: <span className="font-medium text-gray-900">{act.vatAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб.</span></p>
            <p className="text-lg font-bold text-gray-900 mt-2">Итого с НДС: {act.totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб.</p>
          </div>
        </div>
      </div>

      <AttachmentsManager entityType="act" entityId={act.id} />

      <div className="flex justify-end pt-6 border-t">
        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
          {initialAct ? 'Сохранить изменения' : 'Сохранить и Печатать'}
        </button>
      </div>
    </form>
  );
}
