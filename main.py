from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import json
import os
import logging
import base64
import re
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from io import BytesIO
import uuid
from datetime import datetime

# Marker file to verify the script is running
try:
    with open("python_started.txt", "w") as f:
        f.write("Python script started at " + str(datetime.now()))
except Exception as e:
    print(f"Failed to write marker file: {e}")

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("ActApp")

app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global error: {exc}", exc_info=True)
    return Response(
        content=json.dumps({"detail": str(exc), "error": "Internal Server Error"}),
        status_code=500,
        media_type="application/json"
    )

logger.info("Application starting...")

# Разрешаем запросы с фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "acts.db"

def init_db():
    try:
        logger.info("Initializing database...")
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS acts (
                id TEXT PRIMARY KEY,
                actNumber INTEGER,
                actDate TEXT,
                contractNumber TEXT,
                contractDate TEXT,
                updNumber TEXT,
                updDate TEXT,
                objectName TEXT,
                deliveryTerm TEXT,
                actualDeliveryDate TEXT,
                expertise TEXT,
                penalty TEXT,
                customerName TEXT,
                customerShortName TEXT,
                customerRep TEXT,
                customerBasis TEXT,
                customerRepShort TEXT,
                supplierName TEXT,
                supplierShortName TEXT,
                supplierRep TEXT,
                supplierBasis TEXT,
                supplierRepShort TEXT,
                totalAmount REAL,
                vatRate REAL,
                vatAmount REAL,
                items TEXT,
                updDetails TEXT,
                signatureImage TEXT,
                stampImage TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Миграция для существующих баз
        columns_to_add = [
            ("updDetails", "TEXT"),
            ("signatureImage", "TEXT"),
            ("stampImage", "TEXT")
        ]
        for col_name, col_type in columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE acts ADD COLUMN {col_name} {col_type}")
                logger.info(f"Added column {col_name} to acts table")
            except sqlite3.OperationalError:
                # Колонка уже существует
                pass
        conn.commit()
        conn.close()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}", exc_info=True)

init_db()

class UpdDetail(BaseModel):
    number: str
    date: str
    amount: float

class ActItem(BaseModel):
    id: str
    name: str
    unit: str
    quantity: float
    priceWithVat: float
    totalWithVat: float
    country: Optional[str] = "Россия"
    specNumber: Optional[str] = None

class Act(BaseModel):
    id: str
    actNumber: int
    actDate: str
    contractNumber: str
    contractDate: str
    updNumber: str
    updDate: str
    updDetails: Optional[List[UpdDetail]] = None
    objectName: str
    deliveryTerm: str
    actualDeliveryDate: str
    expertise: Optional[str] = None
    penalty: Optional[str] = None
    customerName: str
    customerShortName: str
    customerRep: str
    customerBasis: str
    customerRepShort: str
    supplierName: str
    supplierShortName: str
    supplierRep: str
    supplierBasis: str
    supplierRepShort: str
    totalAmount: float
    vatRate: float
    vatAmount: float
    items: List[ActItem]
    signatureImage: Optional[str] = None
    stampImage: Optional[str] = None

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "backend": "python"}

@app.get("/api/acts")
async def get_acts():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM acts ORDER BY createdAt DESC")
            rows = cursor.fetchall()
            acts = []
            for row in rows:
                act = dict(row)
                act['items'] = json.loads(act['items'])
                if act.get('updDetails'):
                    act['updDetails'] = json.loads(act['updDetails'])
                acts.append(act)
            return acts
    except Exception as e:
        logger.error(f"Error getting acts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/acts")
async def save_act(act: Act):
    try:
        logger.info(f"Saving act: {act.actNumber} (ID: {act.id})")
        
        # Use model_dump() for Pydantic v2, fallback to dict() for v1
        def get_dict(obj):
            return obj.model_dump() if hasattr(obj, 'model_dump') else obj.dict()

        items_json = json.dumps([get_dict(item) for item in act.items])
        upd_details_json = json.dumps([get_dict(d) for d in act.updDetails]) if act.updDetails else None

        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO acts (
                    id, actNumber, actDate, contractNumber, contractDate, updNumber, updDate,
                    objectName, deliveryTerm, actualDeliveryDate, expertise, penalty,
                    customerName, customerShortName, customerRep, customerBasis, customerRepShort,
                    supplierName, supplierShortName, supplierRep, supplierBasis, supplierRepShort,
                    totalAmount, vatRate, vatAmount, items, updDetails, signatureImage, stampImage
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                act.id, act.actNumber, act.actDate, act.contractNumber, act.contractDate, act.updNumber, act.updDate,
                act.objectName, act.deliveryTerm, act.actualDeliveryDate, act.expertise, act.penalty,
                act.customerName, act.customerShortName, act.customerRep, act.customerBasis, act.customerRepShort,
                act.supplierName, act.supplierShortName, act.supplierRep, act.supplierBasis, act.supplierRepShort,
                act.totalAmount, act.vatRate, act.vatAmount, 
                items_json,
                upd_details_json,
                act.signatureImage,
                act.stampImage
            ))
            conn.commit()
        
        logger.info(f"Act {act.actNumber} saved successfully")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving act: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def format_date_ru(date_str: str) -> str:
    if not date_str:
        return "«___» ____________ 20__ г."
    
    # Убираем лишние пробелы и "г."
    clean_str = date_str.replace("г.", "").replace("г", "").strip()
    
    months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря"
    ]
    
    try:
        # Пытаемся распарсить DD.MM.YYYY
        if "." in clean_str:
            parts = clean_str.split(".")
            if len(parts) == 3:
                day = int(parts[0])
                month = int(parts[1])
                year = parts[2]
                if 1 <= month <= 12:
                    return f"«{day:02d}» {months[month-1]} {year} г."
        
        # Пытаемся распарсить YYYY-MM-DD
        if "-" in clean_str:
            parts = clean_str.split("-")
            if len(parts) == 3 and len(parts[0]) == 4:
                year = parts[0]
                month = int(parts[1])
                day = int(parts[2])
                if 1 <= month <= 12:
                    return f"«{day:02d}» {months[month-1]} {year} г."
                    
        # Если дата уже содержит название месяца
        for m in months:
            if m in clean_str.lower():
                # Убираем кавычки если есть
                clean_str = clean_str.replace("«", "").replace("»", "").strip()
                # Извлекаем день, месяц, год
                import re
                match = re.search(r'(\d{1,2})\s+([а-яА-Я]+)\s+(\d{4})', clean_str)
                if match:
                    return f"«{int(match.group(1)):02d}» {match.group(2)} {match.group(3)} г."
                return f"«{clean_str}» г."
    except Exception as e:
        logger.warning(f"Failed to parse date '{date_str}': {e}")
    
    return f"«{clean_str}» г."

def num_to_words_ru(n: float) -> str:
    # Простая реализация для примера
    units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
    tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
    teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
    hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]
    
    def _convert_999(num, is_feminine=False):
        res = []
        h = num // 100
        t = (num % 100) // 10
        u = num % 10
        
        if h: res.append(hundreds[h])
        if t == 1:
            res.append(teens[u])
        else:
            if t: res.append(tens[t])
            if u:
                if is_feminine:
                    if u == 1: res.append("одна")
                    elif u == 2: res.append("две")
                    else: res.append(units[u])
                else:
                    res.append(units[u])
        return " ".join(res)

    rub = int(n)
    kop = int(round((n - rub) * 100))
    
    parts = []
    # Миллионы
    millions = (rub // 1000000) % 1000
    if millions:
        s = _convert_999(millions)
        parts.append(s)
        if millions % 10 == 1 and millions % 100 != 11: parts.append("миллион")
        elif 2 <= millions % 10 <= 4 and not (12 <= millions % 100 <= 14): parts.append("миллиона")
        else: parts.append("миллионов")
        
    # Тысячи
    thousands = (rub // 1000) % 1000
    if thousands:
        s = _convert_999(thousands, is_feminine=True)
        parts.append(s)
        if thousands % 10 == 1 and thousands % 100 != 11: parts.append("тысяча")
        elif 2 <= thousands % 10 <= 4 and not (12 <= thousands % 100 <= 14): parts.append("тысячи")
        else: parts.append("тысяч")
        
    # Единицы
    rem = rub % 1000
    if rem or not parts:
        parts.append(_convert_999(rem))
    
    # Склонение "рубль"
    if rub % 10 == 1 and rub % 100 != 11: parts.append("рубль")
    elif 2 <= rub % 10 <= 4 and not (12 <= rub % 100 <= 14): parts.append("рубля")
    else: parts.append("рублей")
    
    res_str = " ".join(p for p in parts if p).strip()
    return f"{res_str.capitalize()} {kop:02d} копеек"

@app.post("/api/generate-docx")
async def generate_docx_from_data(act_data: Act):
    try:
        logger.info(f"Generating DOCX for act: {act_data.actNumber}")
        # Use model_dump() for Pydantic v2, fallback to dict() for v1
        def get_dict(obj):
            return obj.model_dump() if hasattr(obj, 'model_dump') else obj.dict()

        act_dict = get_dict(act_data)
        items = act_dict['items']
        upd_details = act_dict.get('updDetails') or []

        doc = Document()
        
        # Настройка полей страницы
        sections = doc.sections
        for section in sections:
            section.top_margin = Inches(0.5)
            section.bottom_margin = Inches(0.5)
            section.left_margin = Inches(0.7)
            section.right_margin = Inches(0.5)

        # Настройка шрифта по умолчанию
        style = doc.styles['Normal']
        style.font.name = 'Times New Roman'
        style.font.size = Pt(11)
        style.paragraph_format.space_after = Pt(0)
        style.paragraph_format.line_spacing = 1.15

        # Заголовок
        p = doc.add_paragraph()
        run = p.add_run(f"АКТ приемки-передачи товара №{act['actNumber']}")
        run.bold = True
        run.font.size = Pt(14)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(12)

        # Дата составления (таблица для колонок)
        date_table = doc.add_table(rows=1, cols=2)
        date_table.width = Inches(7.0)
        
        c1 = date_table.rows[0].cells[0].paragraphs[0]
        c1.add_run("Дата составления и подписания\nАкта Поставщиком\n").bold = False
        c1.add_run(format_date_ru(act['actDate']))
        c1.alignment = WD_ALIGN_PARAGRAPH.LEFT
        
        c2 = date_table.rows[0].cells[1].paragraphs[0]
        c2.add_run("Дата составления и подписания\nАкта Заказчиком\n").bold = False
        c2.add_run("«___» ____________ 2026 г.")
        c2.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        doc.add_paragraph().paragraph_format.space_after = Pt(6)

        # Преамбула
        p = doc.add_paragraph()
        p.add_run(f"{act['customerName']} ({act['customerShortName']}), именуемое в дальнейшем «Заказчик», в лице {act['customerRep']}, действующей на основании {act['customerBasis']}, с одной стороны, и {act['supplierName']} ({act['supplierShortName']}), именуемое в дальнейшем «Поставщик», в лице {act['supplierRep']}, действующей на основании {act['supplierBasis']}, с другой стороны, совместно именуемые «Стороны» и каждый в отдельности «Сторона», составили настоящий акт о нижеследующем:")
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.first_line_indent = Inches(0.5)
        p.paragraph_format.space_after = Pt(6)

        # Пункты
        p1 = doc.add_paragraph()
        p1.add_run(f"1. В соответствии с Договором № {act['contractNumber']} от {format_date_ru(act['contractDate'])} (далее Договор) Поставщик выполнил обязательства по поставке товаров, а именно: поставка гидроизоляционных материалов")
        p1.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p1.paragraph_format.first_line_indent = Inches(0.5)
        
        # Point 2
        p2 = doc.add_paragraph()
        upd_str = ""
        if upd_details and len(upd_details) > 0:
            upd_str = ", ".join([f"{d['number']} от {format_date_ru(d['date'])}" for d in upd_details])
        else:
            upd_str = f"{act['updNumber']} от {format_date_ru(act['updDate'])}"
            
        p2.add_run(f"2. Фактически поставлено по заявке к Договору, что подтверждено соответствующими УПД: {upd_str}.")
        p2.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p2.paragraph_format.first_line_indent = Inches(0.5)

        p3 = doc.add_paragraph()
        p3.add_run(f"3. Объект: {act['objectName']}.")
        p3.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p3.paragraph_format.first_line_indent = Inches(0.5)
        p3.paragraph_format.space_after = Pt(6)

        # Таблица
        table = doc.add_table(rows=1, cols=8)
        table.style = 'Table Grid'
        
        # Задаем ширину колонок
        widths = [Inches(0.4), Inches(0.8), Inches(2.0), Inches(0.5), Inches(0.5), Inches(0.9), Inches(0.9), Inches(1.0)]
        for row in table.rows:
            for idx, width in enumerate(widths):
                row.cells[idx].width = width

        hdr_cells = table.rows[0].cells
        headers = ['№\nп/п', '№, указанный в\nприложении №1 к Техн.\nзаданию\n(Спецификация)', 'Наименование\nтоварной позиции', 'Ед.\nизм.', 'Кол-\nво', 'Цена за ед.\n(руб.) в т.ч.\nНДС (при\nналичии)', 'Сумма (руб.)\nв т.ч. НДС\n(при\nналичии)', 'Страна\nпроисхождения']
        
        for i, h in enumerate(headers):
            hdr_cells[i].text = h
            hdr_cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in hdr_cells[i].paragraphs[0].runs:
                run.font.bold = True
                run.font.size = Pt(8)

        for i, item in enumerate(items):
            row_cells = table.add_row().cells
            for idx, width in enumerate(widths):
                row_cells[idx].width = width
            row_cells[0].text = str(i + 1)
            row_cells[1].text = item.get('specNumber') or '-'
            row_cells[2].text = item['name']
            row_cells[3].text = item['unit']
            row_cells[4].text = f"{item['quantity']:.3f}".rstrip('0').rstrip('.').replace('.', ',')
            row_cells[5].text = f"{item['priceWithVat']:,.2f}".replace(',', ' ').replace('.', ',')
            row_cells[6].text = f"{item['totalWithVat']:,.2f}".replace(',', ' ').replace('.', ',')
            row_cells[7].text = item.get('country') or 'Россия'
            
            # Центрирование и шрифт
            for idx, cell in enumerate(row_cells):
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if idx != 2 else WD_ALIGN_PARAGRAPH.LEFT
                for run in cell.paragraphs[0].runs:
                    run.font.size = Pt(8)

        # Итоговая строка
        footer_row = table.add_row().cells
        for idx, width in enumerate(widths):
            footer_row[idx].width = width
        footer_row[0].merge(footer_row[5])
        footer_row[0].text = "Итого:"
        footer_row[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        footer_row[6].text = f"{act['totalAmount']:,.2f}".replace(',', ' ').replace('.', ',')
        footer_row[6].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        for cell in footer_row:
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.bold = True
                    run.font.size = Pt(9)

        doc.add_paragraph().paragraph_format.space_after = Pt(6)

        p4 = doc.add_paragraph()
        p4.add_run("4. Сведения о проведенной экспертизе поставленного товара: " + (act['expertise'] or "______________________________________________________."))
        p4.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p4.paragraph_format.first_line_indent = Inches(0.5)

        p5 = doc.add_paragraph()
        p5.add_run(f"5. Фактический срок поставки: {format_date_ru(act['actualDeliveryDate'])}.")
        p5.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p5.paragraph_format.first_line_indent = Inches(0.5)
        
        p6 = doc.add_paragraph()
        amount_words = num_to_words_ru(act['totalAmount'])
        formatted_total = f"{act['totalAmount']:,.2f}".replace(',', ' ').replace('.', ',')
        formatted_vat = f"{act['vatAmount']:,.2f}".replace(',', ' ').replace('.', ',')
        p6.add_run(f"6. Сумма, подлежащая уплате Поставщику за товар, принятый по настоящему Акту, составляет {formatted_total} руб. ({amount_words}), в том числе НДС {act['vatRate']}% {formatted_vat} руб.")
        p6.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p6.paragraph_format.first_line_indent = Inches(0.5)

        p7 = doc.add_paragraph()
        p7.add_run("7. " + (act['penalty'] or "Неустойка Поставщику не начисляется."))
        p7.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p7.paragraph_format.first_line_indent = Inches(0.5)
        p7.paragraph_format.space_after = Pt(12)

        # Подписи
        sig_table = doc.add_table(rows=2, cols=2)
        sig_table.width = Inches(7.0)
        
        # Заголовки сторон
        cells_hdr = sig_table.rows[0].cells
        cells_hdr[0].text = "Заказчик:"
        cells_hdr[0].paragraphs[0].runs[0].bold = True
        cells_hdr[1].text = "Поставщик:"
        cells_hdr[1].paragraphs[0].runs[0].bold = True
        
        # Контент подписей
        cells = sig_table.rows[1].cells
        
        # Заказчик
        p_cust = cells[0].paragraphs[0]
        p_cust.add_run(f"{act['customerName']} ({act['customerShortName']})\n\n\n________________ / {act['customerRepShort']} /\nМ.П.")
        
        # Поставщик
        p_supp = cells[1].paragraphs[0]
        p_supp.add_run(f"{act['supplierName']} ({act['supplierShortName']})\n\n")
        
        # Вставка подписи и печати если есть
        has_sig = bool(act.get('signatureImage'))
        has_stamp = bool(act.get('stampImage'))

        if has_stamp or has_sig:
            p_img = cells[1].add_paragraph()
            p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            if has_stamp:
                try:
                    b64 = act['stampImage'].split("base64,")[1] if "base64," in act['stampImage'] else act['stampImage']
                    p_img.add_run().add_picture(BytesIO(base64.b64decode(b64)), width=Inches(1.5))
                except Exception as e:
                    logger.error(f"Error adding stamp to docx: {e}")
                    
            if has_sig:
                try:
                    b64 = act['signatureImage'].split("base64,")[1] if "base64," in act['signatureImage'] else act['signatureImage']
                    p_img.add_run().add_picture(BytesIO(base64.b64decode(b64)), width=Inches(1.5))
                except Exception as e:
                    logger.error(f"Error adding signature to docx: {e}")

        p_supp_name = cells[1].add_paragraph()
        p_supp_name.add_run("_________________")
        p_supp_name.add_run(f" / {act['supplierRepShort']} /\n")
        p_supp_name.add_run("М.П.")

        target_stream = BytesIO()
        doc.save(target_stream)
        target_stream.seek(0)

        logger.info(f"DOCX generated successfully for act: {act['actNumber']}")
        return Response(
            content=target_stream.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f"attachment; filename=act_{act['actNumber']}.docx",
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "X-Content-Type-Options": "nosniff"
            }
        )
    except Exception as e:
        logger.error(f"Error generating DOCX: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/acts/{act_id}/docx")
async def download_docx(act_id: str, act: Act):
    return await generate_docx_from_data(act)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
