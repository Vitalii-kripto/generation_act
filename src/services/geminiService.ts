import { GoogleGenAI, Type } from "@google/genai";
import { SpecificationItem } from "../types";

const PRIMARY_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";

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
        "Content-Type": "application/json; charset=utf-8",
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

function isRetryableGeminiError(error: unknown): boolean {
  const text =
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);

  return (
    text.includes('"code":503') ||
    text.includes("503") ||
    text.includes("UNAVAILABLE") ||
    text.includes("high demand") ||
    text.includes("temporarily unavailable")
  );
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  return (
    text.includes('Failed to fetch') ||
    text.includes('fetch cancelled') ||
    text.includes('network error') ||
    text.includes('aborted') ||
    text.includes('interrupted')
  );
}

function getReadableError(error: unknown): string {
  if (isAbortError(error)) return "Запрос прерван (возможно, страница была перезагружена или закрыта)";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Неизвестная ошибка";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function logUsage(response: any, action: string, model: string) {
  try {
    const usage = response?.usageMetadata;
    if (!usage) return;

    await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model,
        prompt_tokens: usage.promptTokenCount || 0,
        candidates_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0,
        action,
      }),
    });
  } catch (e) {
    console.error("Failed to log usage:", e);
    await sendClientLog("warning", "Не удалось записать usage Gemini", {
      model,
      action,
      error: getReadableError(e),
    });
  }
}

async function generateWithModel(
  model: string,
  mimeType: string,
  base64Data: string,
  prompt: string,
  responseSchema: any,
  timeoutMs: number,
  action: string
): Promise<any> {
  const ai = getAI();

  await sendClientLog("info", "Вызов модели Gemini", {
    model,
    mimeType,
    base64Length: base64Data?.length || 0,
    action,
  });

  const response = await withTimeout(
    ai.models.generateContent({
      model,
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
        responseSchema,
      },
    }),
    timeoutMs,
    `Превышено время ожидания ответа от Gemini (${model}).`
  );

  await logUsage(response, action, model);

  if (!response?.text) {
    throw new Error(`Gemini (${model}) вернул пустой ответ.`);
  }

  return response;
}

async function generateWithRetryAndFallback(
  mimeType: string,
  base64Data: string,
  prompt: string,
  responseSchema: any,
  timeoutMs: number,
  action: string
): Promise<{ response: any; modelUsed: string }> {
  const retryDelays = [2000, 5000, 10000];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retryDelays.length + 1; attempt++) {
    const humanAttempt = attempt + 1;

    try {
      await sendClientLog("info", "Попытка вызова основной модели Gemini", {
        model: PRIMARY_MODEL,
        attempt: humanAttempt,
        maxAttempts: retryDelays.length + 1,
        action,
      });

      const response = await generateWithModel(
        PRIMARY_MODEL,
        mimeType,
        base64Data,
        prompt,
        responseSchema,
        timeoutMs,
        action
      );

      await sendClientLog("info", "Основная модель Gemini успешно ответила", {
        model: PRIMARY_MODEL,
        attempt: humanAttempt,
        action,
      });

      return { response, modelUsed: PRIMARY_MODEL };
    } catch (e) {
      lastError = e;

      if (isAbortError(e)) {
        await sendClientLog("error", "Запрос прерван (Abort/Network Error)", {
          model: PRIMARY_MODEL,
          action,
          error: getReadableError(e)
        });
        throw new Error(getReadableError(e));
      }

      const retryable = isRetryableGeminiError(e);

      await sendClientLog(retryable ? "warning" : "error", "Ошибка основной модели Gemini", {
        model: PRIMARY_MODEL,
        attempt: humanAttempt,
        retryable,
        action,
        error: getReadableError(e),
      });

      if (!retryable) {
        throw e;
      }

      if (attempt < retryDelays.length) {
        const delay = retryDelays[attempt];
        await sendClientLog("warning", "Ожидание перед повторной попыткой основной модели", {
          model: PRIMARY_MODEL,
          nextAttempt: humanAttempt + 1,
          delayMs: delay,
          action,
        });
        await sleep(delay);
      }
    }
  }

  await sendClientLog("warning", "Переход на резервную модель Gemini", {
    fromModel: PRIMARY_MODEL,
    toModel: FALLBACK_MODEL,
    action,
    lastError: getReadableError(lastError),
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const humanAttempt = attempt + 1;

    try {
      await sendClientLog("info", "Попытка вызова резервной модели Gemini", {
        model: FALLBACK_MODEL,
        attempt: humanAttempt,
        maxAttempts: 2,
        action,
      });

      const response = await generateWithModel(
        FALLBACK_MODEL,
        mimeType,
        base64Data,
        prompt,
        responseSchema,
        timeoutMs,
        action
      );

      await sendClientLog("info", "Резервная модель Gemini успешно ответила", {
        model: FALLBACK_MODEL,
        attempt: humanAttempt,
        action,
      });

      return { response, modelUsed: FALLBACK_MODEL };
    } catch (e) {
      lastError = e;

      if (isAbortError(e)) {
        await sendClientLog("error", "Запрос прерван (Abort/Network Error)", {
          model: FALLBACK_MODEL,
          action,
          error: getReadableError(e)
        });
        throw new Error(getReadableError(e));
      }

      await sendClientLog("error", "Ошибка резервной модели Gemini", {
        model: FALLBACK_MODEL,
        attempt: humanAttempt,
        action,
        error: getReadableError(e),
      });

      if (attempt < 1) {
        await sleep(3000);
      }
    }
  }

  throw new Error(
    `Не удалось извлечь данные УПД. Основная модель ${PRIMARY_MODEL} недоступна, резервная модель ${FALLBACK_MODEL} также не ответила. Последняя ошибка: ${getReadableError(lastError)}`
  );
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

  const prompt = `
    Извлеките следующую информацию из предоставленного документа УПД (Универсальный передаточный документ) или Счета-фактуры.
    Верните данные в формате JSON согласно схеме.

    Поля для извлечения:
    - updNumber: Номер УПД или Счета-фактуры (Счет-фактура № ... или УПД № ...).
    - updDate: Дата УПД или Счета-фактуры. ВСЕГДА возвращайте в формате ДД.ММ.ГГГГ.
    - contractNumber: Номер договора. Если есть "от", извлеките только номер.
    - contractDate: Дата договора. ВСЕГДА возвращайте в формате ДД.ММ.ГГГГ.
    - supplierName: ПОЛНОЕ наименование продавца/поставщика.
    - supplierShortName: Сокращенное наименование продавца.
    - customerName: ПОЛНОЕ наименование покупателя/заказчика.
    - customerShortName: Сокращенное наименование покупателя.
    - items: Список товаров/услуг.
      - name: Наименование товара.
      - unit: Единица измерения.
      - quantity: Количество.
      - priceWithVat: Цена за единицу с НДС.
      - totalWithVat: Стоимость товаров с налогом - всего.
      - country: Страна происхождения.
    - totalAmount: Общая сумма с НДС.
    - vatAmount: Общая сумма НДС.
    - vatRate: Ставка НДС в процентах.
  `;

  const responseSchema = {
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
  };

  const { response, modelUsed } = await generateWithRetryAndFallback(
    mimeType,
    base64Data,
    prompt,
    responseSchema,
    60000,
    "upd_extraction"
  );

  try {
    const cleanedText = response.text
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "");

    const parsed = JSON.parse(cleanedText) as ExtractedUPDData;

    await sendClientLog("info", "Успешное извлечение данных из УПД", {
      modelUsed,
      updNumber: parsed.updNumber || "",
      updDate: parsed.updDate || "",
      itemsCount: parsed.items?.length || 0,
      totalAmount: parsed.totalAmount || 0,
    });

    return parsed;
  } catch (e) {
    await sendClientLog("error", "Ошибка парсинга JSON ответа Gemini", {
      modelUsed,
      error: getReadableError(e),
      rawTextLength: response.text?.length || 0,
      rawTextPreview: (response.text || "").substring(0, 1000),
    });

    throw new Error(
      `Ошибка обработки данных Gemini (${modelUsed}): ${
        e instanceof Error ? e.message : "Некорректный формат"
      }.`
    );
  }
}

export async function extractSpecificationFromPDF(
  base64Data: string,
  mimeType: string
): Promise<SpecificationItem[]> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(
      "Ключ API Gemini не найден. Добавьте GEMINI_API_KEY или VITE_GEMINI_API_KEY."
    );
  }

  const prompt = `
    Извлеките таблицу спецификации из предоставленного документа.
    Верните данные в формате JSON как массив объектов согласно схеме.

    Поля для извлечения:
    - specNumber: Номер по порядку или номер.
    - name: Наименование товарной позиции.
    - unit: Единица измерения.
    - priceWithVat: Цена за единицу с НДС.
    - quantity: Количество.
    - totalWithVat: Сумма с НДС.
    - country: Страна происхождения.
  `;

  const responseSchema = {
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
  };

  const { response } = await generateWithRetryAndFallback(
    mimeType,
    base64Data,
    prompt,
    responseSchema,
    90000,
    "spec_extraction"
  );

  try {
    const cleanedText = response.text
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "");

    const items = JSON.parse(cleanedText);
    return items;
  } catch (e) {
    throw new Error(
      `Ошибка обработки спецификации: ${
        e instanceof Error ? e.message : "Некорректный формат"
      }`
    );
  }
}
