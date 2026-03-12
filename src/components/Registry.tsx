import React, { useState, useMemo } from 'react';
import { useActContext } from '../store/ActContext';
import { Act } from '../types';
import { FileText, Trash2, Printer, Edit, FileDown, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

type SortField = 'actNumber' | 'actDate' | 'totalAmount' | 'customerShortName';
type SortDirection = 'asc' | 'desc';

export function Registry({ onViewAct, onEditAct }: { onViewAct: (act: Act) => void, onEditAct: (act: Act) => void }) {
  const { acts, deleteAct, downloadDocx, deleteAllActs } = useActContext();
  const [sortField, setSortField] = useState<SortField>('actNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedActs = useMemo(() => {
    return [...acts].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'actNumber') {
        comparison = a.actNumber - b.actNumber;
      } else if (sortField === 'actDate') {
        const parseDate = (dateStr: string) => {
          const parts = dateStr.split('.');
          if (parts.length === 3) {
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
          }
          return new Date(dateStr).getTime();
        };
        comparison = parseDate(a.actDate) - parseDate(b.actDate);
      } else if (sortField === 'totalAmount') {
        comparison = a.totalAmount - b.totalAmount;
      } else if (sortField === 'customerShortName') {
        comparison = a.customerShortName.localeCompare(b.customerShortName);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [acts, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />;
  };

  if (acts.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl shadow-sm">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Нет актов</h3>
        <p className="mt-1 text-sm text-gray-500">Реестр актов приема-передачи пуст.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={deleteAllActs}
          className="inline-flex items-center px-3 py-1.5 border border-red-300 text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4 mr-1.5" />
          Очистить реестр
        </button>
      </div>
      <div className="bg-white shadow-sm rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('actNumber')}
              >
                <div className="flex items-center">
                  № Акта
                  <SortIcon field="actNumber" />
                </div>
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('actDate')}
              >
                <div className="flex items-center">
                  Дата
                  <SortIcon field="actDate" />
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                УПД
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('customerShortName')}
              >
                <div className="flex items-center">
                  Заказчик
                  <SortIcon field="customerShortName" />
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Объект
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('totalAmount')}
              >
                <div className="flex items-center justify-end">
                  Сумма (руб.)
                  <SortIcon field="totalAmount" />
                </div>
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedActs.map((act) => (
              <tr key={act.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {act.actNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {act.actDate}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-[150px] truncate" title={act.updNumber ? `№${act.updNumber} от ${act.updDate}` : 'Нет данных'}>
                  {act.updNumber ? `№${act.updNumber}` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {act.customerShortName}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={act.objectName}>
                  {act.objectName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                  {act.totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => downloadDocx(act)}
                    className="text-green-600 hover:text-green-900 mr-4"
                    title="Скачать DOCX"
                  >
                    <FileDown className="w-5 h-5 inline" />
                  </button>
                  <button
                    onClick={() => onEditAct(act)}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                    title="Редактировать"
                  >
                    <Edit className="w-5 h-5 inline" />
                  </button>
                  <button
                    onClick={() => onViewAct(act)}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                    title="Просмотр и печать"
                  >
                    <Printer className="w-5 h-5 inline" />
                  </button>
                  <button
                    onClick={() => deleteAct(act.id)}
                    className="text-red-600 hover:text-red-900"
                    title="Удалить"
                  >
                    <Trash2 className="w-5 h-5 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
