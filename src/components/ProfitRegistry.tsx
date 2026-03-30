import React, { useEffect, useMemo, useState } from 'react';
import { useUpdContext } from '../store/UpdContext';
import { Search, Save, TrendingUp } from 'lucide-react';
import { UpdResponse } from '../types';

type DraftMap = Record<
  string,
  {
    purchaseAmountGross: number;
    transportAmountGross: number;
  }
>;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function withoutVat22(gross: number): number {
  return round2((gross || 0) / 1.22);
}

export function ProfitRegistry() {
  const { upds, updateUpd } = useUpdContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const nextDrafts: DraftMap = {};
    for (const upd of upds) {
      nextDrafts[upd.id] = {
        purchaseAmountGross: upd.purchaseAmountGross || 0,
        transportAmountGross: upd.transportAmountGross || 0,
      };
    }
    setDrafts(nextDrafts);
  }, [upds]);

  const filteredUpds = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return upds;
    return upds.filter((upd) => {
      return (
        upd.updNumber.toLowerCase().includes(q) ||
        upd.supplierName.toLowerCase().includes(q) ||
        upd.customerName.toLowerCase().includes(q)
      );
    });
  }, [upds, searchTerm]);

  const totals = useMemo(() => {
    return filteredUpds.reduce(
      (acc, upd) => {
        const draft = drafts[upd.id];
        const purchaseGross = draft?.purchaseAmountGross ?? upd.purchaseAmountGross ?? 0;
        const transportGross = draft?.transportAmountGross ?? upd.transportAmountGross ?? 0;

        const shipmentWithoutVat = withoutVat22(upd.totalAmount || 0);
        const purchaseWithoutVat = withoutVat22(purchaseGross);
        const transportWithoutVat = withoutVat22(transportGross);
        const profitWithoutVat = round2(
          shipmentWithoutVat - purchaseWithoutVat - transportWithoutVat
        );

        acc.shipment += shipmentWithoutVat;
        acc.purchase += purchaseWithoutVat;
        acc.transport += transportWithoutVat;
        acc.profit += profitWithoutVat;
        return acc;
      },
      { shipment: 0, purchase: 0, transport: 0, profit: 0 }
    );
  }, [filteredUpds, drafts]);

  const setDraftField = (
    id: string,
    field: 'purchaseAmountGross' | 'transportAmountGross',
    value: number
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        purchaseAmountGross: prev[id]?.purchaseAmountGross ?? 0,
        transportAmountGross: prev[id]?.transportAmountGross ?? 0,
        [field]: value,
      },
    }));
  };

  const saveRow = async (upd: UpdResponse) => {
    const draft = drafts[upd.id];
    if (!draft) return;

    try {
      setSavingId(upd.id);
      await updateUpd(upd.id, {
        ...upd,
        purchaseAmountGross: draft.purchaseAmountGross || 0,
        transportAmountGross: draft.transportAmountGross || 0,
      });
    } catch (error) {
      console.error('Failed to save profit data:', error);
      alert('Ошибка сохранения данных по прибыли');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center">
          <TrendingUp className="w-6 h-6 mr-2 text-green-600" />
          Расчёт прибыли
        </h2>

        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск по УПД..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full md:w-72"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-gray-50 border-b border-gray-200">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Отгрузка без НДС</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.shipment.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Закупка без НДС</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.purchase.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Транспорт без НДС</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.transport.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-green-200">
          <p className="text-sm text-green-600 font-medium">Прибыль без НДС</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            {totals.profit.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">УПД</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Отгрузка с НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Отгрузка без НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Закупка с НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Закупка без НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Транспорт с НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Транспорт без НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Прибыль без НДС</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Действие</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUpds.map((upd) => {
              const draft = drafts[upd.id] || {
                purchaseAmountGross: upd.purchaseAmountGross || 0,
                transportAmountGross: upd.transportAmountGross || 0,
              };

              const shipmentWithoutVat = withoutVat22(upd.totalAmount || 0);
              const purchaseWithoutVat = withoutVat22(draft.purchaseAmountGross || 0);
              const transportWithoutVat = withoutVat22(draft.transportAmountGross || 0);
              const profitWithoutVat = round2(
                shipmentWithoutVat - purchaseWithoutVat - transportWithoutVat
              );

              return (
                <tr key={upd.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{upd.updNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{upd.updDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {upd.totalAmount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {shipmentWithoutVat.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </td>

                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      value={draft.purchaseAmountGross}
                      onChange={(e) =>
                        setDraftField(upd.id, 'purchaseAmountGross', parseFloat(e.target.value) || 0)
                      }
                      className="w-36 rounded-md border-gray-300 shadow-sm p-2 border"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {purchaseWithoutVat.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </td>

                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      value={draft.transportAmountGross}
                      onChange={(e) =>
                        setDraftField(upd.id, 'transportAmountGross', parseFloat(e.target.value) || 0)
                      }
                      className="w-36 rounded-md border-gray-300 shadow-sm p-2 border"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {transportWithoutVat.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </td>

                  <td className={`px-4 py-3 text-sm font-bold ${profitWithoutVat >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {profitWithoutVat.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => saveRow(upd)}
                      disabled={savingId === upd.id}
                      className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {savingId === upd.id ? 'Сохр...' : 'Сохранить'}
                    </button>
                  </td>
                </tr>
              );
            })}

            {filteredUpds.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  УПД не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
