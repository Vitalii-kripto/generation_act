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
import { Settings } from './components/Settings';
import { SpecificationSettings } from './components/SpecificationSettings';
import { ActPrintView } from './components/ActPrintView';
import { FileText, List, Settings as SettingsIcon, Database } from 'lucide-react';
import { Act } from './types';

function AppContent() {
  const [activeTab, setActiveTab] = useState<'create' | 'registry' | 'updRegistry' | 'settings'>('create');
  const [viewingAct, setViewingAct] = useState<Act | null>(null);
  const [editingAct, setEditingAct] = useState<Act | null>(null);
  const { updateAct } = useActContext();

  if (viewingAct) {
    return <ActPrintView act={viewingAct} onBack={() => setViewingAct(null)} />;
  }

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
                onClick={() => { setActiveTab('create'); setEditingAct(null); }}
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
                  onClick={() => setActiveTab('create')}
                  className="border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Редактирование
                </button>
              )}
              <button
                onClick={() => { setActiveTab('registry'); setEditingAct(null); }}
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
                onClick={() => { setActiveTab('updRegistry'); setEditingAct(null); }}
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
                onClick={() => { setActiveTab('settings'); setEditingAct(null); }}
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

        <main>
          {activeTab === 'create' && !editingAct && <CreateAct onCreated={(act) => setViewingAct(act)} />}
          {activeTab === 'create' && editingAct && (
            <CreateAct 
              initialAct={editingAct} 
              onUpdate={(act) => {
                updateAct(act.id, act);
                setEditingAct(null);
                setActiveTab('registry');
              }} 
            />
          )}
          {activeTab === 'registry' && (
            <Registry 
              onViewAct={(act) => setViewingAct(act)} 
              onEditAct={(act) => {
                setEditingAct(act);
                setActiveTab('create');
              }}
            />
          )}
          {activeTab === 'updRegistry' && <UpdRegistry />}
          {activeTab === 'settings' && <Settings />}
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
