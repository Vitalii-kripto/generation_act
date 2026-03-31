/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ActProvider, useActContext } from './store/ActContext';
import { UpdProvider } from './store/UpdContext';
import { UndoProvider } from './store/UndoContext';
import { CreateAct } from './components/CreateAct';
import { Registry } from './components/Registry';
import { UpdRegistry } from './components/UpdRegistry';
import { ProfitRegistry } from './components/ProfitRegistry';
import { Settings } from './components/Settings';
import { ActPrintView } from './components/ActPrintView';
import { FileText, List, Settings as SettingsIcon, Database, TrendingUp } from 'lucide-react';
import { Act } from './types';

function AppContent() {
  const [activeTab, setActiveTab] = useState<'create' | 'registry' | 'updRegistry' | 'profit' | 'settings'>('create');
  const [viewingAct, setViewingAct] = useState<Act | null>(null);
  const [editingAct, setEditingAct] = useState<Act | null>(null);
  const { updateAct } = useActContext();

  const confirmAndSaveProfitIfNeeded = async (): Promise<boolean> => {
    const guard = (window as any).__profitRegistrySaveGuard;

    if (!guard || typeof guard.hasUnsavedChanges !== 'function') {
      return true;
    }

    if (!guard.hasUnsavedChanges()) {
      return true;
    }

    const shouldSave = window.confirm(
      'Во вкладке «Прибыль» есть несохранённые изменения. Сохранить их перед переходом?'
    );

    if (!shouldSave) {
      return false;
    }

    try {
      if (typeof guard.saveNow === 'function') {
        await guard.saveNow();
      }
      return true;
    } catch (error) {
      console.error('Failed to save profit data before tab switch:', error);
      alert('Не удалось сохранить данные вкладки «Прибыль». Переход отменён.');
      return false;
    }
  };

  const handleTabChange = async (
    nextTab: 'create' | 'registry' | 'updRegistry' | 'profit' | 'settings'
  ) => {
    if (activeTab === 'profit' && nextTab !== 'profit') {
      const ok = await confirmAndSaveProfitIfNeeded();
      if (!ok) return;
    }

    if (nextTab !== 'create') {
      setEditingAct(null);
    }

    setActiveTab(nextTab);
  };

  if (viewingAct) {
    return <ActPrintView act={viewingAct} onBack={() => setViewingAct(null)} />;
  }

  const getTabContainerClass = (tab: 'create' | 'registry' | 'updRegistry' | 'profit' | 'settings') =>
    activeTab === tab
      ? 'block'
      : 'absolute -left-[100000px] top-0 w-full h-0 overflow-hidden';

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Генератор Актов приема-передачи</h1>
          <p className="text-gray-600 mt-2">Создание актов на основании УПД и дополнительных данных</p>
        </header>

        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs">
              <button
                onClick={() => void handleTabChange('create')}
                className={`${
                  activeTab === 'create' && !editingAct
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <FileText className="w-5 h-5 mr-2" />
                Создать Акт
              </button>

              {editingAct && (
                <button
                  onClick={() => void handleTabChange('create')}
                  className="border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Редактирование
                </button>
              )}

              <button
                onClick={() => void handleTabChange('registry')}
                className={`${
                  activeTab === 'registry'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <List className="w-5 h-5 mr-2" />
                Реестр Актов
              </button>

              <button
                onClick={() => void handleTabChange('updRegistry')}
                className={`${
                  activeTab === 'updRegistry'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Database className="w-5 h-5 mr-2" />
                Реестр УПД
              </button>

              <button
                onClick={() => void handleTabChange('profit')}
                className={`${
                  activeTab === 'profit'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                Прибыль
              </button>

              <button
                onClick={() => void handleTabChange('settings')}
                className={`${
                  activeTab === 'settings'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <SettingsIcon className="w-5 h-5 mr-2" />
                Настройки
              </button>
            </nav>
          </div>
        </div>

        <main className="relative">
          <div className={getTabContainerClass('create')} aria-hidden={activeTab !== 'create'}>
            {!editingAct ? (
              <CreateAct
                key="create-new-act"
                onCreated={(act) => setViewingAct(act)}
              />
            ) : (
              <CreateAct
                key={`edit-act-${editingAct.id}`}
                initialAct={editingAct}
                onUpdate={(act) => {
                  updateAct(act.id, act);
                  setEditingAct(null);
                  setActiveTab('registry');
                }}
              />
            )}
          </div>

          <div className={getTabContainerClass('registry')} aria-hidden={activeTab !== 'registry'}>
            <Registry
              onViewAct={(act) => setViewingAct(act)}
              onEditAct={(act) => {
                setEditingAct(act);
                setActiveTab('create');
              }}
            />
          </div>

          <div className={getTabContainerClass('updRegistry')} aria-hidden={activeTab !== 'updRegistry'}>
            <UpdRegistry />
          </div>

          <div className={getTabContainerClass('profit')} aria-hidden={activeTab !== 'profit'}>
            <ProfitRegistry />
          </div>

          <div className={getTabContainerClass('settings')} aria-hidden={activeTab !== 'settings'}>
            <Settings />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <UndoProvider>
      <UpdProvider>
        <ActProvider>
          <AppContent />
        </ActProvider>
      </UpdProvider>
    </UndoProvider>
  );
}
