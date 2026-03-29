import React, { useState, useRef, useEffect } from 'react';
import { useActContext } from '../store/ActContext';
import { useUndo } from '../store/UndoContext';
import { SpecificationItem } from '../types';
import { Trash2, Plus, Upload, Loader2, Save, AlertCircle } from 'lucide-react';
import { extractSpecificationFromPDF } from '../services/geminiService';

export function SpecificationSettings() {
  const { specification, setSpecification } = useActContext();
  const { pushAction } = useUndo();
  const [items, setItems] = useState<SpecificationItem[]>(specification);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems(specification);
  }, [specification]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        try {
          const extractedItems = await extractSpecificationFromPDF(base64Data, file.type);
          const newItems = extractedItems.map(item => ({
            ...item,
            id: crypto.randomUUID()
          }));
          setItems(newItems);
        } catch (err) {
          setError('Ошибка при извлечении данных из спецификации. Попробуйте другой файл.');
          console.error(err);
        } finally {
          setIsExtracting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Ошибка при чтении файла.');
      setIsExtracting(false);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        specNumber: '',
        name: '',
        unit: '',
        quantity: 0,
        priceWithVat: 0,
        totalWithVat: 0,
        country: 'Россия'
      }
    ]);
  };

  const updateItem = (id: string, field: keyof SpecificationItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'priceWithVat') {
          updated.totalWithVat = updated.quantity * updated.priceWithVat;
        }
        return updated;
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    const itemToRemove = items.find(i => i.id === id);
    if (itemToRemove) {
      setItems(items.filter(item => item.id !== id));
      pushAction(`Удалена позиция из спецификации: ${itemToRemove.name}`, async () => {
        setItems(prev => [...prev, itemToRemove]);
      });
    }
  };

  const saveSpecification = () => {
    const oldSpec = [...specification];
    setSpecification(items);
    pushAction('Спецификация сохранена', async () => {
      setSpecification(oldSpec);
      setItems(oldSpec);
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex justify-between items-center border-b pb-4 mb-6">
        <h3 className="text-lg font-semibold">Спецификация</h3>
        <div className="flex space-x-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="application/pdf,image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isExtracting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Загрузить из PDF
          </button>
          <button
            onClick={saveSpecification}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Save className="w-4 h-4 mr-2" />
            Сохранить
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№ по спец.</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Наименование</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ед. изм.</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Кол-во</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена с НДС</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Сумма с НДС</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Страна</th>
              <th scope="col" className="relative px-3 py-3"><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={item.specNumber}
                    onChange={(e) => updateItem(item.id, 'specNumber', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border w-16"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border w-24"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    type="number"
                    value={item.priceWithVat}
                    onChange={(e) => updateItem(item.id, 'priceWithVat', parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border w-24"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    type="number"
                    value={item.totalWithVat}
                    onChange={(e) => updateItem(item.id, 'totalWithVat', parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border w-28"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={item.country}
                    onChange={(e) => updateItem(item.id, 'country', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1 border w-24"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => {
                      if (confirmDelete === item.id) {
                        removeItem(item.id);
                        setConfirmDelete(null);
                      } else {
                        setConfirmDelete(item.id);
                        setTimeout(() => setConfirmDelete(prev => prev === item.id ? null : prev), 3000);
                      }
                    }}
                    className={`${confirmDelete === item.id ? 'text-white bg-red-600 px-2 py-1 rounded animate-pulse' : 'text-red-600 hover:text-red-900'}`}
                    title={confirmDelete === item.id ? "Нажмите еще раз для подтверждения" : "Удалить позицию"}
                  >
                    {confirmDelete === item.id ? (
                      <span className="flex items-center text-xs font-bold">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        УДАЛИТЬ?
                      </span>
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <button
          onClick={addItem}
          className="inline-flex items-center px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full justify-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Добавить позицию
        </button>
      </div>
    </div>
  );
}
