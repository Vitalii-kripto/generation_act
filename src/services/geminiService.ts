import { GoogleGenAI, Type } from "@google/genai";
import { SpecificationItem } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    // Check multiple possible locations for the API key
    const apiKey = process.env.GEMINI_API_KEY || 
                   process.env.API_KEY || 
                   (import.meta as any).env?.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("Ключ API Gemini не найден. Пожалуйста, добавьте GEMINI_API_KEY (или VITE_GEMINI_API_KEY) в настройки (Secrets) в AI Studio.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export interface ExtractedUPDData {
  updNumber?: string;
  updDate?: string;
  contractNumber?: string;
  contractDate?: string;
  supplierName?: string;
  supplierShortName?: string;
  customerName?: string;
  customerShortName?: string;
  items?: {
    name: string;
    unit: string;
    quantity: number;
    priceWithVat: number;
    totalWithVat: number;
    country: string;
  }[];
  totalAmount?: number;
  vatAmount?: number;
  vatRate?: number;
}

export async function extractDataFromUPD(base64Data: string, mimeType: string): Promise<ExtractedUPDData> {
  const ai = getAI();
  const prompt = `
    Извлеките следующую информацию из предоставленного документа УПД (Универсальный передаточный документ) или Счета-фактуры.
    Верните данные в формате JSON согласно схеме.
    
    Поля для извлечения:
    - updNumber: Номер УПД или Счета-фактуры (Счет-фактура № ... или УПД № ...).
    - updDate: Дата УПД или Счета-фактуры. ВСЕГДА возвращайте в формате ДД.ММ.ГГГГ (например, 05.03.2026).
    - contractNumber: Номер договора (Основание передачи / Гражданско-правовой договор № ...). Если есть "от", извлеките только номер.
    - contractDate: Дата договора. ВСЕГДА возвращайте в формате ДД.ММ.ГГГГ (например, 22.12.2025).
    - supplierName: ПОЛНОЕ наименование продавца/поставщика (например, "Общество с ограниченной ответственностью «...»"). ОБЯЗАТЕЛЬНО ПОЛНОЕ.
    - supplierShortName: Сокращенное наименование продавца (например, "ООО «...»").
    - customerName: ПОЛНОЕ наименование покупателя/заказчика (например, "Акционерное общество «...»"). ОБЯЗАТЕЛЬНО ПОЛНОЕ.
    - customerShortName: Сокращенное наименование покупателя (например, "АО «...»").
    - items: Список товаров/услуг.
      - name: Наименование товара (Наименование товара).
      - unit: Единица измерения (условное обозначение).
      - quantity: Количество (Количество).
      - priceWithVat: Цена за единицу с НДС. Если в документе указана цена без НДС, вычислите цену с НДС как (Стоимость с налогом / Количество).
      - totalWithVat: Стоимость товаров с налогом - всего (Стоимость товаров (работ, услуг), имущественных прав с налогом - всего).
      - country: Страна происхождения (краткое наименование). Если прочерк, верните пустую строку или "Россия".
    - totalAmount: Общая сумма с НДС по всем позициям (Всего к оплате).
    - vatAmount: Общая сумма НДС (Сумма налога, предъявляемая покупателю).
    - vatRate: Ставка НДС в процентах (Налоговая ставка, например, 20 или 22). Если ставок несколько, укажите основную.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192, // Increase token limit for large documents
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updNumber: { type: Type.STRING },
          updDate: { type: Type.STRING },
          contractNumber: { type: Type.STRING },
          contractDate: { type: Type.STRING },
          supplierName: { type: Type.STRING },
          supplierShortName: { type: Type.STRING },
          customerName: { type: Type.STRING },
          customerShortName: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                unit: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                priceWithVat: { type: Type.NUMBER },
                totalWithVat: { type: Type.NUMBER },
                country: { type: Type.STRING },
              }
            }
          },
          totalAmount: { type: Type.NUMBER },
          vatAmount: { type: Type.NUMBER },
          vatRate: { type: Type.NUMBER },
        }
      }
    }
  });

  if (!response.text) {
    throw new Error("Failed to extract data: Empty response from AI");
  }

  try {
    // Clean potential markdown or whitespace
    const cleanedText = response.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanedText) as ExtractedUPDData;
  } catch (e) {
    console.error("JSON Parse Error. Raw text length:", response.text.length);
    console.error("Partial text:", response.text.substring(0, 500) + "...");
    throw new Error(`Ошибка обработки данных (JSON): ${e instanceof Error ? e.message : 'Некорректный формат'}. Возможно, документ слишком большой.`);
  }
}

export async function extractSpecificationFromPDF(base64Data: string, mimeType: string): Promise<SpecificationItem[]> {
  const ai = getAI();
  const prompt = `
    Извлеките таблицу спецификации из предоставленного документа.
    Верните данные в формате JSON как массив объектов согласно схеме.
    
    Поля для извлечения:
    - specNumber: Номер по порядку или номер (№ п/п).
    - name: Наименование товарной позиции (Перечень поставляемых товаров).
    - unit: Единица измерения.
    - priceWithVat: Цена за единицу с НДС.
    - quantity: Количество (если указано в документе, иначе 0).
    - totalWithVat: Сумма с НДС (если указана, иначе 0).
    - country: Страна происхождения (если указана, иначе "Россия").
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192, // Increase token limit
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            specNumber: { type: Type.STRING },
            name: { type: Type.STRING },
            unit: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            priceWithVat: { type: Type.NUMBER },
            totalWithVat: { type: Type.NUMBER },
            country: { type: Type.STRING },
          }
        }
      }
    }
  });

  if (!response.text) {
    throw new Error("Failed to extract data: Empty response from AI");
  }

  try {
    const cleanedText = response.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const items = JSON.parse(cleanedText);
    return items.map((item: any) => ({
      ...item,
      id: crypto.randomUUID()
    }));
  } catch (e) {
    throw new Error(`Ошибка обработки спецификации (JSON): ${e instanceof Error ? e.message : 'Некорректный формат'}`);
  }
}
