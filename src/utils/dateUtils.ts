/**
 * Стандартизирует дату в формат DD.MM.YYYY
 * Принимает строку в различных форматах (например, "6 марта 2026 г.", "2026-03-06", "06.03.26")
 * и возвращает "06.03.2026"
 */
export function normalizeDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  
  // Если дата уже в формате DD.MM.YYYY, возвращаем как есть (но проверяем длину года)
  const dotFormat = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
  const match = dateStr.match(dotFormat);
  if (match) {
    let [_, day, month, year] = match;
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    if (year.length === 2) year = '20' + year;
    return `${day}.${month}.${year}`;
  }

  // Попытка распарсить стандартным Date
  // Заменяем русские названия месяцев на английские для Date.parse
  const monthsRu: Record<string, string> = {
    'января': 'January', 'январь': 'January',
    'февраля': 'February', 'февраль': 'February',
    'марта': 'March', 'март': 'March',
    'апреля': 'April', 'апрель': 'April',
    'мая': 'May', 'май': 'May',
    'июня': 'June', 'июнь': 'June',
    'июля': 'July', 'июль': 'July',
    'августа': 'August', 'август': 'August',
    'сентября': 'September', 'сентябрь': 'September',
    'октября': 'October', 'октябрь': 'October',
    'ноября': 'November', 'ноябрь': 'November',
    'декабря': 'December', 'декабрь': 'December'
  };

  let processedStr = dateStr.toLowerCase();
  for (const [ru, en] of Object.entries(monthsRu)) {
    processedStr = processedStr.replace(ru, en);
  }
  
  // Убираем "г." или "года"
  processedStr = processedStr.replace(/\s*г\.?$/, '').replace(/\s*года?$/, '');

  const timestamp = Date.parse(processedStr);
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }

  // Если ничего не помогло, возвращаем оригинал (но лучше бы не доводить до этого)
  return dateStr;
}
