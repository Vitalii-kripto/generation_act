import { GoogleGenAI, Type } from "@google/genai";
import { SpecificationItem } from "../types";

let aiInstance: GoogleGenAI | null = null;

type ClientLogLevel = "info" | "warning" | "error" | "debug";

async function sendClientLog(
  level: ClientLogLevel,
  message: string,
  context: Record<string, any> = {}
) {
  try {
    await fetch("/api/frontend-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        level,
        source: "geminiService",
        message,
        context,
      }),
    });
  } catch (e) {
    console.error("Failed to send frontend log:", e);
  }
}

function getApiKey(): string {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    "";

  return apiKey;
}

function getAI() {
  if (!aiInstance) {
    const apiKey = getApiKey();

    if (!apiKey) {
      throw new Error(
        "Ключ API Gemini не найден. Добавьте GEMINI_API_KEY или VITE_GEMINI_API_KEY."
      );
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

async function logUsage(response: any, action: string) {
  try {
    const usage = response.usageMetadata;
    if (!usage) return;

    await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        prompt_tokens: usage.promptTokenCount || 0,
        candidates_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0,
        action,
      }),
    });
  } catch (e) {
    console.error("Failed to log usage:", e);
    await sendClientLog("warning", "Не удалось записать usage Gemini", {
      action,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

export async function extractDataFromUPD(
  base64Data: string,
  mimeType: string
): Promise<ExtractedUPDData> {
  const apiKey = getApiKey();

  await sendClientLog("info", "Старт извлечения данных из УПД", {
    mimeType,
    hasApiKey: Boolean(apiKey),
    base64Length: base64Data?.length || 0,
  });

  if (!apiKey) {
    await sendClientLog("error", "Gemini API key отсутствует", { mimeType });
    throw new Error(
      "Ключ API Gemini не найден. Добавьте GEMINI_API_KEY или VITE_GEMINI_API_KEY."
    );
  }

  const ai = getAI();

  const prompt = `
    Извлеките следующую информацию из предоставленного документа УПД (Универсальный передаточный документ) или Счета-фактуры.
    Верните данные в формате JSON согласно схеме.

    Поля для извлечения:
    - updNumber: Номер УПД или Счета-фактуры (Счет-фактура № ... или УПД № ...).
    - updDate: Дата УПД или Счета-фактуры. ВСЕГДА возвращайте в формате ДД.ММ.ГГГГ (например, 05.03.2026).
    - contractNumber: Номер договора (Основание передачи / Гражданско-правовой договор № ...). Если есть "от", извлеките только номер.
    - contractDate: Дата договора. ВСЕГДА возвращайте в формате ДД.ММ.ГГГГ (например, 22.12.2025).
    - supplierName: ПОЛНОЕ наименование продавца/поставщика.
    - supplierShortName: Сокращенное наименование продавца.
    - customerName: ПОЛНОЕ наименование покупателя/заказчика.
    - customerShortName: Сокращенное наименование покупателя.
    - items: Список товаров/услуг.
      - name: Наименование товара.
      - unit: Единица измерения.
      - quantity: Количество.
      - priceWithVat: Цена за единицу с НДС. Если в документе указана цена без НДС, вычислите цену с НДС как (Стоимость с налогом / Количество).
      - totalWithVat: Стоимость товаров с налогом - всего.
      - country: Страна происхождения. Если прочерк, верните пустую строку или "Россия".
    - totalAmount: Общая сумма с НДС.
    - vatAmount: Общая сумма НДС.
    - vatRate: Ставка НДС в процентах.
  `;

  let response: any;

  try {
    response = await withTimeout(
      ai.models.generateContent({
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
          maxOutputTokens: 8192,
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
                  },
                },
              },
              totalAmount: { type: Type.NUMBER },
              vatAmount: { type: Type.NUMBER },
              vatRate: { type: Type.NUMBER },
            },
          },
        },
      }),
      60000,
      "Превышено время ожидания ответа от Gemini API. Попробуйте еще раз или используйте документ меньшего размера."
    );
  } catch (e) {
    await sendClientLog("error", "Ошибка вызова Gemini при извлечении УПД", {
      mimeType,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e instanceof Error ? e : new Error("Ошибка вызова Gemini API");
  }

  await logUsage(response, "upd_extraction");

  if (!response?.text) {
    await sendClientLog("error", "Gemini вернул пустой ответ", {
      mimeType,
      responseKeys: Object.keys(response || {}),
    });
    throw new Error("Gemini вернул пустой ответ. Данные УПД не извлечены.");
  }

  try {
    const cleanedText = response.text
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "");

    const parsed = JSON.parse(cleanedText) as ExtractedUPDData;

    await sendClientLog("info", "Успешное извлечение данных из УПД", {
      mimeType,
      updNumber: parsed.updNumber || "",
      updDate: parsed.updDate || "",
      itemsCount: parsed.items?.length || 0,
      totalAmount: parsed.totalAmount || 0,
    });

    return parsed;
  } catch (e) {
    await sendClientLog("error", "Ошибка парсинга JSON ответа Gemini", {
      mimeType,
      error: e instanceof Error ? e.message : String(e),
      rawTextLength: response.text?.length || 0,
      rawTextPreview: (response.text || "").substring(0, 1000),
    });

    throw new Error(
      `Ошибка обработки данных Gemini (JSON): ${
        e instanceof Error ? e.message : "Некорректный формат"
      }. Возможно, документ слишком большой или модель вернула невалидный JSON.`
    );
  }
}

export async function extractSpecificationFromPDF(
  base64Data: string,
  mimeType: string
): Promise<SpecificationItem[]> {
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

  const response = await withTimeout(
    ai.models.generateContent({
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
        maxOutputTokens: 8192,
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
            },
          },
        },
      },
    }),
    90000,
    "Превышено время ожидания обработки спецификации. Пожалуйста, попробуйте еще раз."
  );

  await logUsage(response, "spec_extraction");

  if (!response.text) {
    throw new Error("Failed to extract data: Empty response from AI");
  }

  try {
    const cleanedText = response.text
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "");
    const items = JSON.parse(cleanedText);
    return items.map((item: any) => ({
      ...item,
      id: crypto.randomUUID(),
    }));
  } catch (e) {
    throw new Error(
      `Ошибка обработки спецификации (JSON): ${
        e instanceof Error ? e.message : "Некорректный формат"
      }`
    );
  }
}
