import React from 'react';
import { Act } from '../types';
import { numberToWordsRu } from '../utils/numberToWords';
import { useActContext } from '../store/ActContext';
import { Download, FileText } from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface ActPrintViewProps {
  act: Act;
  onBack: () => void;
}

export function ActPrintView({ act, onBack }: ActPrintViewProps) {
  const { signatureImage, stampImage, downloadDocx } = useActContext();

  const handlePdf = () => {
    const element = document.getElementById('act-content');
    const opt = {
      margin:       10,
      filename:     `Акт_${act.actNumber}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto bg-white p-12 shadow-lg print:shadow-none print:max-w-none">
        <div className="flex justify-between mb-8 print:hidden">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
          >
            Назад
          </button>
          <div className="flex space-x-4">
            <button
              onClick={handlePdf}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              <FileText className="w-4 h-4 mr-2" />
              Скачать PDF
            </button>
            <button
              onClick={() => downloadDocx(act)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Скачать DOCX
            </button>
          </div>
        </div>

        <div id="act-content" className="font-serif text-[15px] text-black leading-relaxed" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
          <h1 className="text-center font-bold text-lg mb-8">
            АКТ приемки-передачи товара №{act.actNumber}
          </h1>

          <div className="flex justify-between mb-8">
            <div>
              <p>Дата составления и подписания</p>
              <p>Акта Поставщиком</p>
              <p>{formatActDate(act.actDate)}</p>
            </div>
            <div>
              <p>Дата составления и подписания</p>
              <p>Акта Заказчиком</p>
              <p>«___» ____________ 2026 г.</p>
            </div>
          </div>

          <p className="indent-8 text-justify mb-4">
            {act.customerName} ({act.customerShortName}), именуемое в дальнейшем «Заказчик», в лице {act.customerRep}, действующей на основании {act.customerBasis}, с одной стороны, и {act.supplierName} ({act.supplierShortName}), именуемое в дальнейшем «Поставщик», в лице {act.supplierRep}, действующей на основании {act.supplierBasis}, с другой стороны, совместно именуемые «Стороны» и каждый в отдельности «Сторона», составили настоящий акт о нижеследующем:
          </p>

          <p className="indent-8 text-justify mb-4">
            1. В соответствии с Договором № {act.contractNumber} от {formatActDate(act.contractDate)} (далее Договор) Поставщик выполнил обязательства по поставке товаров, а именно: поставка гидроизоляционных материалов.
          </p>

          <div className="indent-8 text-justify mb-4">
            2. Фактически поставлено по заявке к Договору, что подтверждено соответствующими УПД: 
            {act.updDetails && act.updDetails.length > 0 ? (
              <span className="inline">
                {act.updDetails.map((d, i) => (
                  <span key={i}>
                    {i > 0 ? ', ' : ' '}
                    № {d.number} от {formatActDate(d.date)}
                  </span>
                ))}
              </span>
            ) : (
              <span> № {act.updNumber} от {formatActDate(act.updDate)}</span>
            )}
          </div>

          <p className="indent-8 text-justify mb-4">
            3. Объект: {act.objectName}.
          </p>

          <table className="w-full border-collapse border border-black mb-4 text-xs">
            <thead>
              <tr>
                <th className="border border-black p-1">№ п/п</th>
                <th className="border border-black p-1">№, указанный в приложении №1 к Техн. заданию (Спецификация)</th>
                <th className="border border-black p-1">Наименование товарной позиции</th>
                <th className="border border-black p-1">Ед. изм.</th>
                <th className="border border-black p-1">Кол-во</th>
                <th className="border border-black p-1">Цена за ед. (руб.) в т.ч. НДС</th>
                <th className="border border-black p-1">Сумма (руб.) в т.ч. НДС</th>
                <th className="border border-black p-1">Страна происхождения</th>
              </tr>
            </thead>
            <tbody>
              {act.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="border border-black p-1 text-center">{index + 1}</td>
                  <td className="border border-black p-1 text-center">{item.specNumber || '-'}</td>
                  <td className="border border-black p-1">{item.name}</td>
                  <td className="border border-black p-1 text-center">{item.unit}</td>
                  <td className="border border-black p-1 text-center">{item.quantity}</td>
                  <td className="border border-black p-1 text-right">{item.priceWithVat.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
                  <td className="border border-black p-1 text-right">{item.totalWithVat.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
                  <td className="border border-black p-1 text-center">{item.country}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={6} className="border border-black p-1 text-right font-bold">Итого</td>
                <td className="border border-black p-1 text-right font-bold">{act.totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
                <td className="border border-black p-1"></td>
              </tr>
            </tbody>
          </table>

          <p className="indent-8 text-justify mb-4">
            4. Сведения о проведенной экспертизе поставленного товара: {act.expertise || '______________________________________________________'}.
          </p>

          <p className="indent-8 text-justify mb-4">
            5. Фактический срок поставки: {formatActDate(act.actualDeliveryDate)}.
          </p>

          <p className="indent-8 text-justify mb-4">
            6. Сумма, подлежащая уплате Поставщику за товар, принятый по настоящему Акту составляет {act.totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб. ({numberToWordsRu(act.totalAmount)}), в т.ч. НДС {act.vatRate}% {act.vatAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб.
          </p>

          <p className="indent-8 text-justify mb-8">
            7. {act.penalty || 'Неустойка Поставщику не начисляется.'}
          </p>

          <div className="flex justify-between mt-16" style={{ pageBreakInside: 'avoid' }}>
            <div className="w-5/12">
              <p className="font-bold mb-1">Заказчик:</p>
              <p className="font-bold mb-1">{act.customerRep.split(' ').slice(0, 3).join(' ')}</p>
              <p className="font-bold mb-4">{act.customerShortName}</p>
              <div className="h-[60px]"></div>
              <div className="relative">
                <div className="flex items-end relative z-10">
                  <div className="border-b border-black flex-grow"></div>
                  <div className="ml-2 whitespace-nowrap">/ {act.customerRepShort} /</div>
                </div>
                <p className="mt-2 relative z-10">М.П.</p>
              </div>
            </div>
            <div className="w-5/12">
              <p className="font-bold mb-1">Поставщик:</p>
              <p className="font-bold mb-1">{act.supplierRep.split(' ').slice(0, 2).join(' ')}</p>
              <p className="font-bold mb-4">{act.supplierShortName}</p>
              <div className="h-[60px] relative">
                {stampImage && (
                  <img src={stampImage} alt="Печать" className="absolute w-[180px] h-[180px] object-contain mix-blend-multiply pointer-events-none" style={{ top: '-60px', left: '-20px', zIndex: 0 }} />
                )}
                {signatureImage && (
                  <img src={signatureImage} alt="Подпись" className="absolute w-[220px] h-[120px] object-contain mix-blend-multiply pointer-events-none" style={{ top: '-40px', left: '20px', zIndex: 1 }} />
                )}
              </div>
              <div className="relative">
                <div className="flex items-end relative z-10">
                  <div className="border-b border-black flex-grow"></div>
                  <div className="ml-2 whitespace-nowrap">/ {act.supplierRepShort} /</div>
                </div>
                <p className="mt-2 relative z-10">М.П.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getMonthName(monthStr: string) {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const m = parseInt(monthStr, 10);
  if (m >= 1 && m <= 12) return months[m - 1];
  return '';
}

function formatActDate(dateStr: string) {
  if (!dateStr) return '«___» ____________ 20__ г.';
  
  const cleanStr = dateStr.replace(/\s*г\.?$/, '').trim();

  // Parse DD.MM.YYYY
  if (cleanStr.includes('.')) {
    const parts = cleanStr.split('.');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      return `«${day}» ${getMonthName(parts[1])} ${parts[2]} г.`;
    }
  }

  // Parse YYYY-MM-DD
  if (cleanStr.includes('-')) {
    const parts = cleanStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const day = parts[2].padStart(2, '0');
      return `«${day}» ${getMonthName(parts[1])} ${parts[0]} г.`;
    }
  }
  
  // Parse "DD month YYYY" or "«DD» month YYYY"
  const match = cleanStr.match(/(\d{1,2})[»"']?\s+([а-яА-Яa-zA-Z]+)\s+(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].toLowerCase();
    const year = match[3];
    return `«${day}» ${month} ${year} г.`;
  }
  
  // Fallback
  const fallbackClean = cleanStr.replace(/[«»]/g, '');
  return `«${fallbackClean}» г.`;
}
