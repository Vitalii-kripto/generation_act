import React, { useState, useRef } from 'react';
import { useActContext } from '../store/ActContext';
import { Upload, Trash2 } from 'lucide-react';
import { SpecificationSettings } from './SpecificationSettings';

export function Settings() {
  const { 
    nextActNumber, setNextActNumber,
    signatureImage, setSignatureImage,
    stampImage, setStampImage
  } = useActContext();
  const [localNumber, setLocalNumber] = useState(nextActNumber.toString());
  
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const num = parseInt(localNumber, 10);
    if (!isNaN(num) && num > 0) {
      setNextActNumber(num);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (img: string | null) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
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
                    onClick={() => setSignatureImage(null)}
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
                onChange={(e) => handleImageUpload(e, setSignatureImage)} 
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
                    onClick={() => setStampImage(null)}
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
                onChange={(e) => handleImageUpload(e, setStampImage)} 
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
