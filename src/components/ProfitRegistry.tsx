import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUpdContext } from '../store/UpdContext';
import { Search, TrendingUp, Download, Save } from 'lucide-react';
import { UpdResponse } from '../types';

type DraftMap = Record<
  string,
  {
    purchaseAmountGross: number;
    transportAmountGross: number;
    includeInProfit: boolean;
  }
>;

type SortField = 'updNumber' | 'updDate';
type SortDirection = 'asc' | 'desc';

const STORAGE_KEY = 'profitRegistryDrafts';
const AUTOSAVE_DELAY_MS = 800;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function withoutVat22(gross: number): number {
  return round2((gross || 0) / 1.22);
}

function parseRuDate(dateStr: string): number {
  if (!dateStr) return 0;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return 0;
  return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
}

function loadDraftsFromStorage(): DraftMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveDraftsToStorage(drafts: DraftMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // ignore localStorage errors
  }
}

function clearDraftsStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore localStorage errors
  }
}

export function ProfitRegistry() {
  const { upds, updateUpd } = useUpdContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [sortField, setSortField] = useState<SortField>('updDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const initializedRef = useRef(false);
  const draftsRef = useRef<DraftMap>({});
  const updsRef = useRef<UpdResponse[]>([]);
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const saveTimersRef = useRef<Record<string, number>>({});
  const savingIdsRef = useRef<Set<string>>(new Set());

  draftsRef.current = drafts;
  updsRef.current = upds;

  const markSaving = (id: string, isSaving: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (isSaving) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return Array.from(next);
    });
  };

  useEffect(() => {
    setDrafts((prev) => {
      const next: DraftMap = { ...prev };
      const storedDrafts = !initializedRef.current ? loadDraftsFromStorage() : {};

      for (const upd of upds) {
        const serverDraft = {
          purchaseAmountGross: upd.purchaseAmountGross || 0,
          transportAmountGross: upd.transportAmountGross || 0,
          includeInProfit: upd.includeInProfit !== false,
        };

        if (!initializedRef.current && storedDrafts[upd.id]) {
          next[upd.id] = storedDrafts[upd.id];
        } else if (
          !dirtyIdsRef.current.has(upd.id) &&
          !savingIdsRef.current.has(upd.id)
        ) {
          next[upd.id] = serverDraft;
        } else if (!next[upd.id]) {
          next[upd.id] = serverDraft;
        }
      }

      initializedRef.current = true;
      return next;
    });
  }, [upds]);

  useEffect(() => {
    saveDraftsToStorage(drafts);
  }, [drafts]);

  const hasUnsavedChanges = () =>
    dirtyIdsRef.current.size > 0 ||
    Object.keys(saveTimersRef.current).length > 0 ||
    savingIdsRef.current.size > 0;

  const saveRowNow = async (id: string) => {
    const upd = updsRef.current.find((u) => u.id === id);
    const draft = draftsRef.current[id];

    if (!upd || !draft) return;

    if (saveTimersRef.current[id]) {
      clearTimeout(saveTimersRef.current[id]);
      delete saveTimersRef.current[id];
    }

    savingIdsRef.current.add(id);
    markSaving(id, true);

    try {
      await updateUpd(id, {
        ...upd,
        purchaseAmountGross: draft.purchaseAmountGross || 0,
        transportAmountGross: draft.transportAmountGross || 0,
        includeInProfit: draft.includeInProfit,
      });
      dirtyIdsRef.current.delete(id);
    } catch (error) {
      console.error(`Failed to autosave row ${id}:`, error);
      throw error;
    } finally {
      savingIdsRef.current.delete(id);
      markSaving(id, false);
    }
  };

  const saveAllNow = async () => {
    const idsFromTimers = Object.keys(saveTimersRef.current);
    const idsFromDirty = Array.from(dirtyIdsRef.current);
    const ids = Array.from(new Set([...idsFromTimers, ...idsFromDirty]));

    for (const id of ids) {
      await saveRowNow(id);
    }

    if (dirtyIdsRef.current.size === 0) {
      clearDraftsStorage();
    }
  };

  const scheduleSave = (id: string, delay = AUTOSAVE_DELAY_MS) => {
    if (saveTimersRef.current[id]) {
      clearTimeout(saveTimersRef.current[id]);
    }

    saveTimersRef.current[id] = window.setTimeout(async () => {
      delete saveTimersRef.current[id];
      try {
        await saveRowNow(id);
        if (dirtyIdsRef.current.size === 0) {
          clearDraftsStorage();
        }
      } catch (error) {
        console.error(`Autosave timer failed for row ${id}:`, error);
      }
    }, delay);
  };

  const updateDraftField = (
    id: string,
    field: 'purchaseAmountGross' | 'transportAmountGross' | 'includeInProfit',
    value: number | boolean,
    immediateSave = false
  ) => {
    setDrafts((prev) => {
      const next: DraftMap = {
        ...prev,
        [id]: {
          purchaseAmountGross: prev[id]?.purchaseAmountGross ?? 0,
          transportAmountGross: prev[id]?.transportAmountGross ?? 0,
          includeInProfit: prev[id]?.includeInProfit ?? true,
          [field]: value,
        },
      };
      return next;
    });

    dirtyIdsRef.current.add(id);

    if (immediateSave) {
      void saveRowNow(id).catch((error) => {
        console.error('Immediate save failed:', error);
        alert('Ошибка автоматического сохранения данных');
      });
    } else {
      scheduleSave(id);
    }
  };

  const handleBlurSave = async (id: string) => {
    if (!dirtyIdsRef.current.has(id)) return;
    try {
      await saveRowNow(id);
      if (dirtyIdsRef.current.size === 0) {
        clearDraftsStorage();
      }
    } catch (error) {
      console.error('Blur save failed:', error);
      alert('Ошибка автоматического сохранения данных');
    }
  };

  useEffect(() => {
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, []);

  useEffect(() => {
    (window as any).__profitRegistrySaveGuard = {
      hasUnsavedChanges: () => hasUnsavedChanges(),
      saveNow: async () => {
        await saveAllNow();
      },
    };

    return () => {
      const currentGuard = (window as any).__profitRegistrySaveGuard;
      if (currentGuard) {
        delete (window as any).__profitRegistrySaveGuard;
      }
    };
  }, []);

  const filteredAndSortedUpds = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    const filtered = !q
      ? upds
      : upds.filter((upd) => {
          return (
            upd.updNumber.toLowerCase().includes(q) ||
            upd.supplierName.toLowerCase().includes(q) ||
            upd.customerName.toLowerCase().includes(q)
          );
        });

    return [...filtered].sort((a, b) => {
      let result = 0;

      if (sortField === 'updNumber') {
        result = a.updNumber.localeCompare(b.updNumber, 'ru', {
          numeric: true,
          sensitivity: 'base',
        });
      } else if (sortField === 'updDate') {
        result = parseRuDate(a.updDate) - parseRuDate(b.updDate);
      }

      return sortDirection === 'asc' ? result : -result;
    });
  }, [upds, searchTerm, sortField, sortDirection]);

  const totals = useMemo(() => {
    return filteredAndSortedUpds.reduce(
      (acc, upd) => {
        const draft = drafts[upd.id] || {
          purchaseAmountGross: upd.purchaseAmountGross || 0,
          transportAmountGross: upd.transportAmountGross || 0,
          includeInProfit: upd.includeInProfit !== false,
        };

        const shouldInclude =
          draft.includeInProfit && (!onlyPaid || Boolean(upd.isPaid));

        const shipmentWithoutVat = withoutVat22(upd.totalAmount || 0);
        const purchaseWithoutVat = withoutVat22(draft.purchaseAmountGross);
        const transportWithoutVat = withoutVat22(draft.transportAmountGross);
        const profitWithoutVat = round2(
          shipmentWithoutVat - purchaseWithoutVat - transportWithoutVat
        );

        if (shouldInclude) {
          acc.shipment += shipmentWithoutVat;
          acc.purchase += purchaseWithoutVat;
          acc.transport += transportWithoutVat;
          acc.profit += profitWithoutVat;
        }

        return acc;
      },
      { shipment: 0, purchase: 0, transport: 0, profit: 0 }
    );
  }, [filteredAndSortedUpds, drafts, onlyPaid]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'updDate' ? 'desc' : 'asc');
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      await saveAllNow();
    } catch (error) {
      console.error('Failed to save all:', error);
      alert('Ошибка при сохранении изменений');
    } finally {
      setIsSavingAll(false);
    }
  };

  const exportProfitReport = () => {
    const url = `/api/profit/export?onlyPaid=${onlyPaid ? 'true' : 'false'}`;
    window.open(url, '_blank');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <TrendingUp className="w-6 h-6 mr-2 text-green-600" />
            Расчёт прибыли
          </h2>

          <div className="flex flex-col md:flex-row gap-3">
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

            <button
              onClick={handleSaveAll}
              disabled={isSavingAll}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSavingAll ? 'Сохранение...' : 'Сохранить'}
            </button>

            <button
              onClick={exportProfitReport}
              className="inline-flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Экспорт в Excel
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="onlyPaid"
            type="checkbox"
            checked={onlyPaid}
            onChange={(e) => setOnlyPaid(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded"
          />
          <label htmlFor="onlyPaid" className="text-sm font-medium text-gray-700">
            Учитывать только оплаченные
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-gray-50 border-b border-gray-200">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Общая отгрузка без НДС</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.shipment.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Общая закупка без НДС</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.purchase.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 font-medium">Общий транспорт без НДС</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {totals.transport.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-green-200">
          <p className="text-sm text-green-600 font-medium">Итоговая общая прибыль без НДС</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            {totals.profit.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Учитывать</th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('updNumber')}
              >
                Номер УПД
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('updDate')}
              >
                Дата УПД
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Оплачено</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Отгрузка с НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Отгрузка без НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Закупка с НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Закупка без НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Транспорт с НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Транспорт без НДС</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Прибыль без НДС</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedUpds.map((upd) => {
              const draft = drafts[upd.id] || {
                purchaseAmountGross: upd.purchaseAmountGross || 0,
                transportAmountGross: upd.transportAmountGross || 0,
                includeInProfit: upd.includeInProfit !== false,
              };

              const shipmentWithoutVat = withoutVat22(upd.totalAmount || 0);
              const purchaseWithoutVat = withoutVat22(draft.purchaseAmountGross || 0);
              const transportWithoutVat = withoutVat22(draft.transportAmountGross || 0);
              const profitWithoutVat = round2(
                shipmentWithoutVat - purchaseWithoutVat - transportWithoutVat
              );

              const rowSaving = savingIds.includes(upd.id);

              return (
                <tr key={upd.id}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={draft.includeInProfit}
                      onChange={(e) =>
                        updateDraftField(upd.id, 'includeInProfit', e.target.checked, true)
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{upd.updNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{upd.updDate}</td>
                  <td className="px-4 py-3 text-center text-sm">
                    {upd.isPaid ? 'Да' : 'Нет'}
                  </td>
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
                        updateDraftField(
                          upd.id,
                          'purchaseAmountGross',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      onBlur={() => void handleBlurSave(upd.id)}
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
                        updateDraftField(
                          upd.id,
                          'transportAmountGross',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      onBlur={() => void handleBlurSave(upd.id)}
                      className="w-36 rounded-md border-gray-300 shadow-sm p-2 border"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {transportWithoutVat.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold ${profitWithoutVat >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    <div className="flex items-center gap-2">
                      <span>
                        {profitWithoutVat.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                      </span>
                      {rowSaving && (
                        <span className="text-xs font-normal text-blue-600">Сохранение...</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredAndSortedUpds.length === 0 && (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
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
