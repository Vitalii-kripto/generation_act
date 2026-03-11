import React from 'react';
import { useActContext } from '../store/ActContext';
import { Act } from '../types';
import { FileText, Trash2, Printer, Edit, FileDown } from 'lucide-react';

export function Registry({ onViewAct, onEditAct }: { onViewAct: (act: Act) => void, onEditAct: (act: Act) => void }) {
  const { acts, deleteAct, downloadDocx } = useActContext();

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
    <div className="bg-white shadow-sm rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                № Акта
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Дата
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Заказчик
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Объект
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Сумма (руб.)
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {acts.map((act) => (
              <tr key={act.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {act.actNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {act.actDate}
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
  );
}
