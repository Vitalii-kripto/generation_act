from fastapi import FastAPI, HTTPException, Response, UploadFile, File
from fastapi.responses import FileResponse
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
from docx.shared import Pt, Inches, RGBColor, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import parse_xml, OxmlElement
from io import BytesIO
import uuid
from copy import deepcopy
from datetime import datetime, timedelta
import holidays
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter
import asyncio
from playwright.async_api import async_playwright

# Marker file to verify the script is running
try:
    with open("python_started.txt", "w") as f:
        f.write("Python script started at " + str(datetime.now()))
except Exception as e:
    print(f"Failed to write marker file: {e}")

# Настройка логирования
os.makedirs("logs", exist_ok=True)
log_mode = os.environ.get("LOG_MODE", "w")
handlers = [logging.StreamHandler()]
log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

if os.environ.get("RUN_DEV"):
    # When running under run_dev.py, simplify the format since run_dev.py adds timestamp and prefix
    log_format = '%(levelname)s - %(message)s'
else:
    handlers.append(logging.FileHandler("logs/app.log", mode=log_mode, encoding='utf-8'))

logging.basicConfig(
    level=logging.INFO,
    format=log_format,
    handlers=handlers
)
logger = logging.getLogger("FastAPI_Main")
ai_logger = logging.getLogger("AiService")
logger.info("Logging initialized")
ai_logger.info("Initializing AiService...")

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

class UsageLog(BaseModel):
    model: str
    prompt_tokens: int
    candidates_tokens: int
    total_tokens: int
    action: str  # e.g., "upd_extraction", "spec_extraction"

class FrontendLog(BaseModel):
    level: str
    message: str
    source: Optional[str] = "frontend"
    context: Optional[dict] = None

def init_db():
    try:
        logger.info("Initializing database...")
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usage_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model TEXT,
                prompt_tokens INTEGER,
                candidates_tokens INTEGER,
                total_tokens INTEGER,
                action TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
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
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS upds (
                id TEXT PRIMARY KEY,
                updNumber TEXT,
                updDate TEXT,
                supplierName TEXT,
                customerName TEXT,
                items TEXT,
                totalAmount REAL,
                vatAmount REAL,
                vatRate REAL,
                source TEXT,
                isUsedInAct BOOLEAN DEFAULT 0,
                isPaid BOOLEAN DEFAULT 0,
                purchaseAmountGross REAL DEFAULT 0,
                transportAmountGross REAL DEFAULT 0,
                includeInProfit BOOLEAN DEFAULT 1,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                entityType TEXT NOT NULL,
                entityId TEXT NOT NULL,
                fileName TEXT NOT NULL,
                fileType TEXT NOT NULL,
                fileSize INTEGER NOT NULL,
                uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                uploadedBy TEXT,
                comment TEXT,
                data TEXT NOT NULL
            )
        ''')
        
        # Миграция для вложений
        cursor.execute("PRAGMA table_info(attachments)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'data' not in columns:
            logger.info("Adding 'data' column to attachments table")
            cursor.execute("ALTER TABLE attachments ADD COLUMN data TEXT")
        else:
            logger.info("'data' column already exists in attachments table")
            
        # Миграция для существующих баз (акты)
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
                
        # Миграция для таблицы upds
        upds_columns_to_add = [
            ("isPaid", "BOOLEAN DEFAULT 0"),
            ("purchaseAmountGross", "REAL DEFAULT 0"),
            ("transportAmountGross", "REAL DEFAULT 0"),
            ("includeInProfit", "BOOLEAN DEFAULT 1")
        ]
        for col_name, col_type in upds_columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE upds ADD COLUMN {col_name} {col_type}")
                logger.info(f"Added column {col_name} to upds table")
            except sqlite3.OperationalError:
                pass
                
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ''')
                
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
    attachmentsCount: Optional[int] = 0

class AttachmentCreate(BaseModel):
    id: str
    entityType: str
    entityId: str
    fileName: str
    fileType: str
    fileSize: int
    uploadedBy: Optional[str] = None
    comment: Optional[str] = None
    data: str

class Attachment(BaseModel):
    id: str
    entityType: str
    entityId: str
    fileName: str
    fileType: str
    fileSize: int
    uploadedAt: Optional[str] = None
    uploadedBy: Optional[str] = None
    comment: Optional[str] = None

class UpdItem(BaseModel):
    id: str
    name: str
    unit: str
    quantity: float
    priceWithVat: float
    totalWithVat: float
    country: Optional[str] = "Россия"
    specNumber: Optional[str] = None

class Upd(BaseModel):
    id: str
    updNumber: str
    updDate: str
    supplierName: str
    customerName: str
    items: List[UpdItem]
    totalAmount: float
    vatAmount: float
    vatRate: float
    source: Optional[str] = None
    isUsedInAct: Optional[bool] = False
    isPaid: Optional[bool] = False
    purchaseAmountGross: Optional[float] = 0.0
    transportAmountGross: Optional[float] = 0.0
    includeInProfit: Optional[bool] = True
    createdAt: Optional[str] = None

class UpdResponse(Upd):
    acceptanceDate: str
    paymentDate: str
    daysUntilPayment: int
    status: str
    attachmentsCount: Optional[int] = 0
    shipmentWithoutVat: float
    purchaseWithoutVat: float
    transportWithoutVat: float
    profitWithoutVat: float

ru_holidays = holidays.RU(years=range(2020, 2030))

def is_working_day(dt: datetime) -> bool:
    d = dt.date()
    # 2026 specific holidays and shifts (Russian Production Calendar)
    if d.year == 2026:
        # Jan 1-9: New Year holidays (Jan 1-8) + shift from Jan 3 (Jan 9)
        if d.month == 1 and 1 <= d.day <= 9: return False
        # Feb 23: Defender of the Fatherland Day
        if d.month == 2 and d.day == 23: return False
        # Mar 8, 9: International Women's Day (Mar 8) + shift from Mar 8 (Mar 9)
        if d.month == 3 and (d.day == 8 or d.day == 9): return False
        # May 1: Spring and Labor Day
        if d.month == 5 and d.day == 1: return False
        # May 4: Shift from Jan 4
        if d.month == 5 and d.day == 4: return False
        # May 9, 11: Victory Day (May 9) + shift from May 9 (May 11)
        if d.month == 5 and (d.day == 9 or d.day == 11): return False
        # June 12: Russia Day
        if d.month == 6 and d.day == 12: return False
        # Nov 4: Unity Day
        if d.month == 11 and d.day == 4: return False
        
        # Standard weekends (no working Saturdays in 2026)
        if dt.weekday() >= 5:
            return False
        return True
        
    # Fallback for other years
    if dt.weekday() >= 5:
        return False
    if d in ru_holidays:
        return False
    return True

def add_working_days(start_date: datetime, days_to_add: int) -> datetime:
    current_date = start_date
    added_days = 0
    # Include start day if it's a working day
    if is_working_day(current_date):
        added_days = 1
        
    if added_days >= days_to_add:
        return current_date
        
    while added_days < days_to_add:
        current_date += timedelta(days=1)
        if is_working_day(current_date):
            added_days += 1
    return current_date

def get_working_days_between(start_date: datetime, end_date: datetime) -> int:
    days = 0
    current_date = start_date
    
    if start_date.date() == end_date.date():
        return 1 if is_working_day(start_date) else 0
        
    if start_date < end_date:
        step = 1
    else:
        step = -1
        
    # Include start day
    if is_working_day(current_date):
        days = 1 if step > 0 else -1
        
    while current_date.date() != end_date.date():
        current_date += timedelta(days=step)
        if is_working_day(current_date):
            days += step
    return days

def parse_date(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%d.%m.%Y")
    except ValueError:
        return datetime.now()

def calculate_upd_dates(upd_date_str: str):
    upd_date = parse_date(upd_date_str)
    acceptance_date = add_working_days(upd_date, 50)
    payment_date = add_working_days(acceptance_date, 7)
    
    today = datetime.now()
    days_until_payment = get_working_days_between(today, payment_date)
    
    if days_until_payment > 3:
        status = 'green'
    elif days_until_payment >= 0:
        status = 'yellow'
    else:
        status = 'red'
        
    return {
        "acceptanceDate": acceptance_date.strftime("%d.%m.%Y"),
        "paymentDate": payment_date.strftime("%d.%m.%Y"),
        "daysUntilPayment": days_until_payment,
        "status": status
    }

def round2(value: float) -> float:
    return round(float(value or 0), 2)

def without_vat_22(gross_value: float) -> float:
    return round2((float(gross_value or 0)) / 1.22)

def enrich_profit_fields(upd: dict) -> dict:
    total_amount = float(upd.get("totalAmount") or 0)
    purchase_gross = float(upd.get("purchaseAmountGross") or 0)
    transport_gross = float(upd.get("transportAmountGross") or 0)

    shipment_without_vat = without_vat_22(total_amount)
    purchase_without_vat = without_vat_22(purchase_gross)
    transport_without_vat = without_vat_22(transport_gross)
    profit_without_vat = round2(
        shipment_without_vat - purchase_without_vat - transport_without_vat
    )

    upd["purchaseAmountGross"] = round2(purchase_gross)
    upd["transportAmountGross"] = round2(transport_gross)
    upd["includeInProfit"] = bool(upd.get("includeInProfit", True))
    upd["shipmentWithoutVat"] = shipment_without_vat
    upd["purchaseWithoutVat"] = purchase_without_vat
    upd["transportWithoutVat"] = transport_without_vat
    upd["profitWithoutVat"] = profit_without_vat
    return upd

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "backend": "python"}

@app.post("/api/usage")
async def log_usage(log: UsageLog):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO usage_stats (model, prompt_tokens, candidates_tokens, total_tokens, action)
                VALUES (?, ?, ?, ?, ?)
            ''', (log.model, log.prompt_tokens, log.candidates_tokens, log.total_tokens, log.action))
            conn.commit()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error logging usage: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/frontend-log")
async def frontend_log(log: FrontendLog):
    try:
        frontend_logger = logging.getLogger("FrontendClient")
        
        # Format the message nicely
        context_str = f" | Context: {json.dumps(log.context, ensure_ascii=False)}" if log.context else ""
        text = f"[{log.source}] {log.message}{context_str}"

        level = (log.level or "info").lower()

        if level == "debug":
            frontend_logger.debug(text)
        elif level == "warning":
            frontend_logger.warning(text)
        elif level == "error":
            frontend_logger.error(text)
        else:
            frontend_logger.info(text)

        return {"success": True}
    except Exception as e:
        logger.error(f"Error logging frontend message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/usage/stats")
async def get_usage_stats():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Total stats
            cursor.execute('''
                SELECT 
                    COUNT(*) as total_requests,
                    SUM(prompt_tokens) as total_prompt_tokens,
                    SUM(candidates_tokens) as total_candidates_tokens,
                    SUM(total_tokens) as total_tokens
                FROM usage_stats
            ''')
            overall = dict(cursor.fetchone())
            
            # Stats for today
            today = datetime.now().strftime('%Y-%m-%d')
            cursor.execute('''
                SELECT 
                    COUNT(*) as requests_today,
                    SUM(total_tokens) as tokens_today
                FROM usage_stats 
                WHERE date(timestamp) = ?
            ''', (today,))
            daily = dict(cursor.fetchone())
            
            # Stats by action
            cursor.execute('''
                SELECT action, COUNT(*) as count, SUM(total_tokens) as tokens
                FROM usage_stats
                GROUP BY action
            ''')
            by_action = [dict(row) for row in cursor.fetchall()]
            
            return {
                "overall": overall,
                "daily": daily,
                "by_action": by_action
            }
    except Exception as e:
        logger.error(f"Error getting usage stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/upds")
async def get_upds():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Fetch all acts to determine which UPDs are used
            cursor.execute("SELECT updNumber, updDate, updDetails FROM acts")
            acts_data = cursor.fetchall()
            used_upds = set()
            for act_row in acts_data:
                if act_row['updDetails']:
                    try:
                        details = json.loads(act_row['updDetails'])
                        for d in details:
                            if d.get('number') and d.get('date'):
                                used_upds.add((d['number'], d['date']))
                    except:
                        pass
                elif act_row['updNumber'] and act_row['updDate']:
                    # Fallback for older acts without updDetails
                    nums = [n.strip() for n in act_row['updNumber'].split(',')]
                    dates = [d.strip() for d in act_row['updDate'].split(',')]
                    for n, d in zip(nums, dates):
                        used_upds.add((n, d))
            
            cursor.execute('''
                SELECT u.*, 
                       (SELECT COUNT(*) FROM attachments a WHERE a.entityType = 'upd' AND a.entityId = u.id) as attachmentsCount
                FROM upds u 
                ORDER BY u.createdAt DESC
            ''')
            rows = cursor.fetchall()
            upds = []
            for row in rows:
                upd = dict(row)
                upd['items'] = json.loads(upd['items'])

                is_used = (upd['updNumber'], upd['updDate']) in used_upds
                upd['isUsedInAct'] = is_used

                upd['isPaid'] = bool(upd.get('isPaid', False))
                upd['purchaseAmountGross'] = float(upd.get('purchaseAmountGross') or 0)
                upd['transportAmountGross'] = float(upd.get('transportAmountGross') or 0)
                upd['includeInProfit'] = bool(upd.get('includeInProfit', True))

                dates_info = calculate_upd_dates(upd['updDate'])
                upd.update(dates_info)

                upd = enrich_profit_fields(upd)
                upds.append(upd)
            return upds
    except Exception as e:
        logger.error(f"Error fetching upds: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def dump_model(obj):
    return obj.model_dump() if hasattr(obj, 'model_dump') else obj.dict()

@app.post("/api/upds")
async def create_upd(upd: Upd, overwrite: bool = False):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            
            # Check uniqueness (case-insensitive for number)
            cursor.execute("SELECT id FROM upds WHERE LOWER(TRIM(updNumber)) = LOWER(TRIM(?)) AND updDate = ?", (upd.updNumber, upd.updDate))
            existing = cursor.fetchone()
            
            if existing and not overwrite:
                raise HTTPException(status_code=409, detail="УПД с таким номером и датой уже существует")
            
            if existing and overwrite:
                cursor.execute("DELETE FROM upds WHERE id = ?", (existing[0],))
                
            cursor.execute('''
                INSERT INTO upds (
                    id, updNumber, updDate, supplierName, customerName, items,
                    totalAmount, vatAmount, vatRate, source, isUsedInAct, isPaid,
                    purchaseAmountGross, transportAmountGross, includeInProfit
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                upd.id, upd.updNumber, upd.updDate, upd.supplierName, upd.customerName,
                json.dumps([dump_model(item) for item in upd.items]),
                upd.totalAmount, upd.vatAmount, upd.vatRate, upd.source,
                1 if upd.isUsedInAct else 0,
                1 if upd.isPaid else 0,
                float(upd.purchaseAmountGross or 0),
                float(upd.transportAmountGross or 0),
                1 if upd.includeInProfit else 0
            ))
            conn.commit()
            
            dates_info = calculate_upd_dates(upd.updDate)
            response_data = dump_model(upd)
            response_data.update(dates_info)
            response_data = enrich_profit_fields(response_data)
            return response_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating upd: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/upds/{id}")
async def update_upd(id: str, upd: Upd):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE upds SET
                    updNumber = ?, updDate = ?, supplierName = ?, customerName = ?,
                    items = ?, totalAmount = ?, vatAmount = ?, vatRate = ?,
                    source = ?, isUsedInAct = ?, isPaid = ?,
                    purchaseAmountGross = ?, transportAmountGross = ?, includeInProfit = ?
                WHERE id = ?
            ''', (
                upd.updNumber, upd.updDate, upd.supplierName, upd.customerName,
                json.dumps([dump_model(item) for item in upd.items]),
                upd.totalAmount, upd.vatAmount, upd.vatRate,
                upd.source, 1 if upd.isUsedInAct else 0,
                1 if upd.isPaid else 0,
                float(upd.purchaseAmountGross or 0),
                float(upd.transportAmountGross or 0),
                1 if upd.includeInProfit else 0,
                id
            ))
            conn.commit()
            
            dates_info = calculate_upd_dates(upd.updDate)
            response_data = dump_model(upd)
            response_data.update(dates_info)
            response_data = enrich_profit_fields(response_data)
            return response_data
    except Exception as e:
        logger.error(f"Error updating upd: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/upds/{id}")
async def delete_upd(id: str):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM attachments WHERE entityType = 'upd' AND entityId = ?", (id,))
            cursor.execute("DELETE FROM upds WHERE id = ?", (id,))
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        logger.error(f"Error deleting upd: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/attachments")
async def create_attachment(attachment: AttachmentCreate):
    try:
        data_len = len(attachment.data) if attachment.data else 0
        logger.info(f"Creating attachment {attachment.fileName} for {attachment.entityType} {attachment.entityId}, data length: {data_len}")
        
        if not attachment.data or data_len < 10:
            logger.warning(f"Received suspiciously small or empty data for attachment {attachment.fileName}")
            
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO attachments (
                    id, entityType, entityId, fileName, fileType, fileSize, uploadedBy, comment, data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                attachment.id, attachment.entityType, attachment.entityId, attachment.fileName,
                attachment.fileType, attachment.fileSize, attachment.uploadedBy, attachment.comment, attachment.data
            ))
            conn.commit()
            
            # Verify the data was saved
            cursor.execute("SELECT length(data) FROM attachments WHERE id = ?", (attachment.id,))
            saved_row = cursor.fetchone()
            saved_len = saved_row[0] if saved_row else 0
            logger.info(f"Attachment {attachment.id} created successfully, verified saved data length: {saved_len}")
            
            return {"status": "success", "id": attachment.id}
    except Exception as e:
        logger.error(f"Error creating attachment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/attachments")
async def debug_attachments():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id, fileName, entityType, entityId, length(data) as data_len FROM attachments ORDER BY uploadedAt DESC LIMIT 10")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/attachments/{id}/download")
async def download_attachment(id: str):
    try:
        logger.info(f"Downloading attachment {id}")
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT fileName, fileType, data FROM attachments WHERE id = ?", (id,))
            row = cursor.fetchone()
            if not row:
                logger.warning(f"Attachment {id} not found")
                raise HTTPException(status_code=404, detail="Attachment not found")
            
            file_name, file_type, data = row
            
            logger.info(f"Successfully fetched attachment {id}, data length: {len(data) if data else 0}")
            
            return {
                "fileName": file_name,
                "fileType": file_type,
                "data": data
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading attachment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/attachments/{entityType}/{entityId}")
async def get_attachments(entityType: str, entityId: str):
    try:
        logger.info(f"Fetching attachments for {entityType} {entityId}")
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, entityType, entityId, fileName, fileType, fileSize, uploadedAt, uploadedBy, comment 
                FROM attachments 
                WHERE entityType = ? AND entityId = ?
                ORDER BY uploadedAt DESC
            ''', (entityType, entityId))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching attachments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/attachments/{id}")
async def update_attachment(id: str, attachment: dict):
    try:
        logger.info(f"Updating attachment {id}")
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            
            # Only allow updating comment for now
            if "comment" in attachment:
                cursor.execute(
                    "UPDATE attachments SET comment = ? WHERE id = ?",
                    (attachment["comment"], id)
                )
            
            conn.commit()
            logger.info(f"Attachment {id} updated successfully")
            return {"status": "success"}
    except Exception as e:
        logger.error(f"Error updating attachment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/attachments/{id}")
async def delete_attachment(id: str):
    try:
        logger.info(f"Deleting attachment {id}")
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM attachments WHERE id = ?", (id,))
            conn.commit()
            logger.info(f"Attachment {id} deleted successfully")
            return {"status": "success"}
    except Exception as e:
        logger.error(f"Error deleting attachment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import FileResponse
import tempfile
import os

@app.get("/api/upds/export")
async def export_upds():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM upds")
            rows = cursor.fetchall()
            
            # Convert to dict and sort in Python
            upds_list = []
            for row in rows:
                upd = dict(row)
                upd['isPaid'] = bool(upd.get('isPaid', False))
                upds_list.append(upd)
                
            def sort_key(u):
                date_str = u.get('updDate', '')
                try:
                    parts = date_str.split('.')
                    if len(parts) == 3:
                        # YYYY-MM-DD for sorting
                        date_val = f"{parts[2]}-{parts[1]}-{parts[0]}"
                    else:
                        date_val = "0000-00-00"
                except:
                    date_val = "0000-00-00"
                return (date_val, u.get('updNumber', ''))
                
            upds_list.sort(key=sort_key, reverse=False)
            
            # Calculate totals
            total_amount = sum(u['totalAmount'] for u in upds_list)
            paid_amount = sum(u['totalAmount'] for u in upds_list if u['isPaid'])
            unpaid_amount = total_amount - paid_amount

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Реестр УПД"
            
            # Main Title
            report_date = datetime.now().strftime("%d.%m.%Y %H:%M")
            ws.merge_cells('A1:G1')
            title_cell = ws.cell(row=1, column=1, value=f"Реестр УПД АО «ТСК» (отчет от {report_date})")
            title_cell.font = Font(bold=True, size=14)
            title_cell.alignment = Alignment(horizontal='center')

            # Summary info (shifted down)
            ws.cell(row=3, column=1, value="Общая сумма отгрузок:").font = Font(bold=True)
            ws.cell(row=3, column=2, value=total_amount).number_format = '#,##0.00'
            
            ws.cell(row=4, column=1, value="Сумма оплаченных УПД:").font = Font(bold=True)
            ws.cell(row=4, column=2, value=paid_amount).number_format = '#,##0.00'
            
            ws.cell(row=5, column=1, value="Сумма неоплаченных УПД:").font = Font(bold=True)
            ws.cell(row=5, column=2, value=unpaid_amount).number_format = '#,##0.00'
            
            headers = ["Номер УПД", "Дата УПД", "Сумма документа", "Дата приемки", "Дата оплаты", "Статус сроков", "Статус оплаты"]
            # Header row at Row 7
            for col_idx, header in enumerate(headers, start=1):
                cell = ws.cell(row=7, column=col_idx, value=header)
                cell.font = Font(bold=True)
            
            green_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
            yellow_fill = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
            red_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
            
            # Data starts at Row 8
            for row_idx, upd in enumerate(upds_list, start=8):
                dates_info = calculate_upd_dates(upd['updDate'])
                
                ws.cell(row=row_idx, column=1, value=upd['updNumber'])
                ws.cell(row=row_idx, column=2, value=upd['updDate'])
                
                amount_cell = ws.cell(row=row_idx, column=3, value=upd['totalAmount'])
                amount_cell.number_format = '#,##0.00'
                
                ws.cell(row=row_idx, column=4, value=dates_info['acceptanceDate'])
                ws.cell(row=row_idx, column=5, value=dates_info['paymentDate'])
                
                status_cell = ws.cell(row=row_idx, column=6, value=dates_info['status'])
                
                if upd['isPaid']:
                    status_cell.fill = green_fill
                    status_cell.value = "Оплачено"
                else:
                    if dates_info['status'] == 'green':
                        status_cell.fill = green_fill
                        status_cell.value = "В срок"
                    elif dates_info['status'] == 'yellow':
                        status_cell.fill = yellow_fill
                        status_cell.value = "Скоро"
                    else:
                        status_cell.fill = red_fill
                        status_cell.value = "Просрочено"
                        
                paid_status_cell = ws.cell(row=row_idx, column=7, value="Оплачено" if upd['isPaid'] else "Не оплачено")
                if upd['isPaid']:
                    paid_status_cell.fill = green_fill
                else:
                    paid_status_cell.fill = red_fill
            
            # Auto-adjust column widths
            for col in ws.columns:
                max_length = 0
                # Use a cell that is not merged to get the column letter safely
                # Or use get_column_letter with the column index
                column_idx = col[0].column
                column_letter = get_column_letter(column_idx)
                
                for cell in col:
                    # Skip merged cells for length calculation as they might span multiple columns
                    if hasattr(cell, 'value') and cell.value:
                        try:
                            val_len = len(str(cell.value))
                            if val_len > max_length:
                                max_length = val_len
                        except:
                            pass
                adjusted_width = (max_length + 2)
                ws.column_dimensions[column_letter].width = adjusted_width
                
            fd, path = tempfile.mkstemp(suffix=".xlsx")
            os.close(fd)
            wb.save(path)
            
            return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename="upd_registry.xlsx")
    except Exception as e:
        logger.error(f"Error exporting upds: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eis/search")
async def search_eis(query: str):
    logger.info(f"Searching EIS for: {query}")
    try:
        async with async_playwright() as p:
            # Launch browser with some arguments to avoid detection
            browser = await p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            # Set timeout to 45 seconds
            page.set_default_timeout(45000)
            
            # EIS search URL
            url = f"https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString={query}&morphology=on&search-filter=%D0%94%D0%B0%D1%82%D0%B5+%D1%80%D0%B0%D0%B7%D0%BC%D0%B5%D1%89%D0%B5%D0%BD%D0%B8%D1%8F&pageNumber=1&sortDirection=false&recordsPerPage=_10&showLotsInfo=false&sortBy=UPDATE_DATE&fz44=on&fz223=on&af=on&ca=on&pc=on&pa=on&currencyIdAll=-1"
            
            try:
                await page.goto(url, wait_until="domcontentloaded")
                # Wait for results or "no results" message
                await page.wait_for_selector(".search-registry-entry-block, .no-results", timeout=30000)
            except Exception as e:
                logger.error(f"Timeout or error navigating to EIS: {e}")
                await browser.close()
                raise HTTPException(status_code=504, detail="EIS search timed out. Please try again later.")

            # Extract results
            results = []
            entries = await page.query_selector_all(".search-registry-entry-block")
            for entry in entries:
                try:
                    number_el = await entry.query_selector(".registry-entry__header-mid__number a")
                    number = await number_el.inner_text() if number_el else ""
                    link = await number_el.get_attribute("href") if number_el else ""
                    if link and not link.startswith("http"):
                        link = "https://zakupki.gov.ru" + link
                        
                    status_el = await entry.query_selector(".registry-entry__header-mid__item")
                    status = await status_el.inner_text() if status_el else ""
                    
                    customer_el = await entry.query_selector(".registry-entry__body-href a")
                    customer = await customer_el.inner_text() if customer_el else ""
                    
                    amount_el = await entry.query_selector(".price-block__value")
                    amount = await amount_el.inner_text() if amount_el else ""
                    
                    results.append({
                        "number": number.strip(),
                        "link": link,
                        "status": status.strip(),
                        "customer": customer.strip(),
                        "amount": amount.strip()
                    })
                except:
                    continue
            
            await browser.close()
            return {"results": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected EIS search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error during EIS search: {str(e)}")

@app.get("/api/acts")
async def get_acts():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT a.*, 
                       (SELECT COUNT(*) FROM attachments att WHERE att.entityType = 'act' AND att.entityId = a.id) as attachmentsCount
                FROM acts a 
                ORDER BY a.createdAt DESC
            ''')
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
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Check if any UPD in this act is used in another act
            if act.updDetails:
                # Fetch all other acts to check their UPDs
                cursor.execute("SELECT id, actNumber, updDetails FROM acts WHERE id != ?", (act.id,))
                other_acts = cursor.fetchall()
                
                for detail in act.updDetails:
                    clean_num = detail.number.strip().lower()
                    clean_date = detail.date.strip()
                    
                    for other_act in other_acts:
                        if other_act['updDetails']:
                            try:
                                other_details = json.loads(other_act['updDetails'])
                                for od in other_details:
                                    od_num = od.get('number', '').strip().lower()
                                    od_date = od.get('date', '').strip()
                                    if od_num == clean_num and od_date == clean_date:
                                        raise HTTPException(
                                            status_code=409, 
                                            detail=f"УПД №{detail.number} от {detail.date} уже используется в Акте №{other_act['actNumber']}"
                                        )
                            except json.JSONDecodeError:
                                continue

        items_json = json.dumps([dump_model(item) for item in act.items])
        upd_details_json = json.dumps([dump_model(d) for d in act.updDetails]) if act.updDetails else None

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
            
            # Update UPDs status
            # First, mark all UPDs as not used
            cursor.execute("UPDATE upds SET isUsedInAct = 0")
            
            # Then, mark UPDs used in any act as used
            cursor.execute("SELECT updDetails FROM acts")
            all_acts = cursor.fetchall()
            
            used_upds = set()
            for row in all_acts:
                if row[0]: # updDetails is the first column in this query
                    try:
                        details = json.loads(row[0])
                        for detail in details:
                            used_upds.add((detail.get('number', '').strip().lower(), detail.get('date', '').strip()))
                    except json.JSONDecodeError:
                        continue
            
            for num, date in used_upds:
                cursor.execute(
                    "UPDATE upds SET isUsedInAct = 1 WHERE LOWER(TRIM(updNumber)) = ? AND updDate = ?",
                    (num, date)
                )
                
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
    
    try:
        # Пытаемся распарсить DD.MM.YYYY
        if "." in clean_str:
            parts = clean_str.split(".")
            if len(parts) == 3:
                day = parts[0].zfill(2)
                month = parts[1].zfill(2)
                year = parts[2]
                if len(year) == 2:
                    year = "20" + year
                return f"{day}.{month}.{year}"
        
        # Пытаемся распарсить YYYY-MM-DD
        if "-" in clean_str:
            parts = clean_str.split("-")
            if len(parts) == 3 and len(parts[0]) == 4:
                year = parts[0]
                month = parts[1].zfill(2)
                day = parts[2].zfill(2)
                return f"{day}.{month}.{year}"
        
        # Если это уже длинный формат или что-то еще, попробуем извлечь цифры
        import re
        match = re.search(r'(\d{1,2})\s+([а-яА-Я]+)\s+(\d{4})', clean_str)
        if match:
            day = match.group(1).zfill(2)
            month_name = match.group(2).lower()
            year = match.group(3)
            
            months_map = {
                "января": "01", "февраля": "02", "марта": "03", "апреля": "04",
                "мая": "05", "июня": "06", "июля": "07", "августа": "08",
                "сентября": "09", "октября": "10", "ноября": "11", "декабря": "12"
            }
            
            month = months_map.get(month_name, "01")
            return f"{day}.{month}.{year}"

        return clean_str
    except Exception as e:
        logger.warning(f"Failed to parse date '{date_str}': {e}")
        return clean_str

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

# =========================
# НАСТРАИВАЕМЫЕ ПАРАМЕТРЫ
# =========================

STAMP_WIDTH_MM = 45.0
SIGNATURE_WIDTH_MM = 60.0

# Тонкая подстройка положения в блоке Поставщика
# Координаты задаются относительно абзаца со строкой подписи
STAMP_OFFSET_X_MM = 33.0
STAMP_OFFSET_Y_MM = -2.0

SIGNATURE_OFFSET_X_MM = 6.0
SIGNATURE_OFFSET_Y_MM = -10.0


def mm_to_emu(mm: float) -> int:
    return int(mm * 36000)


def build_anchor_from_inline(inline, x_emu: int, y_emu: int, behind_doc: bool = True):
    anchor = OxmlElement("wp:anchor")
    anchor.set("distT", "0")
    anchor.set("distB", "0")
    anchor.set("distL", "0")
    anchor.set("distR", "0")
    anchor.set("simplePos", "0")
    anchor.set("relativeHeight", "251659264")
    anchor.set("behindDoc", "1" if behind_doc else "0")
    anchor.set("locked", "0")
    anchor.set("layoutInCell", "1")
    anchor.set("allowOverlap", "1")

    simple_pos = OxmlElement("wp:simplePos")
    simple_pos.set("x", "0")
    simple_pos.set("y", "0")
    anchor.append(simple_pos)

    position_h = OxmlElement("wp:positionH")
    position_h.set("relativeFrom", "column")
    pos_offset_h = OxmlElement("wp:posOffset")
    pos_offset_h.text = str(x_emu)
    position_h.append(pos_offset_h)
    anchor.append(position_h)

    position_v = OxmlElement("wp:positionV")
    position_v.set("relativeFrom", "paragraph")
    pos_offset_v = OxmlElement("wp:posOffset")
    pos_offset_v.text = str(y_emu)
    position_v.append(pos_offset_v)
    anchor.append(position_v)

    extent = inline.xpath("./wp:extent")[0]
    anchor.append(deepcopy(extent))

    effect_extents = inline.xpath("./wp:effectExtent")
    if effect_extents:
        anchor.append(deepcopy(effect_extents[0]))
    else:
        effect = OxmlElement("wp:effectExtent")
        effect.set("l", "0")
        effect.set("t", "0")
        effect.set("r", "0")
        effect.set("b", "0")
        anchor.append(effect)

    wrap_none = OxmlElement("wp:wrapNone")
    anchor.append(wrap_none)

    doc_pr = inline.xpath("./wp:docPr")[0]
    anchor.append(deepcopy(doc_pr))

    c_nv = inline.xpath("./wp:cNvGraphicFramePr")
    if c_nv:
        anchor.append(deepcopy(c_nv[0]))

    graphic = inline.xpath("./a:graphic")[0]
    anchor.append(deepcopy(graphic))

    return anchor


def add_floating_picture_behind_text(
    paragraph,
    image_bytes: bytes,
    width_mm: float,
    x_offset_mm: float,
    y_offset_mm: float,
    height_mm: float | None = None,
):
    run = paragraph.add_run()
    image_stream = BytesIO(image_bytes)

    if height_mm is not None:
        run.add_picture(image_stream, width=Mm(width_mm), height=Mm(height_mm))
    else:
        run.add_picture(image_stream, width=Mm(width_mm))

    drawing = run._r.xpath("./w:drawing")[0]
    inline = drawing.xpath("./wp:inline")[0]

    anchor = build_anchor_from_inline(
        inline=inline,
        x_emu=mm_to_emu(x_offset_mm),
        y_emu=mm_to_emu(y_offset_mm),
        behind_doc=True,
    )

    drawing.remove(inline)
    drawing.append(anchor)

@app.post("/api/generate-docx")
async def generate_docx_from_data(act_data: Act):
    try:
        logger.info(f"Generating DOCX for act: {act_data.actNumber}")
        act = dump_model(act_data)
        items = act['items']
        upd_details = act.get('updDetails') or []

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
        
        # Заказчик — внизу документа только краткое наименование, без скобок
        p_cust = cells[0].paragraphs[0]
        p_cust.add_run(f"{act['customerShortName']}\n\n\n________________ / {act['customerRepShort']} /\nМ.П.")

        # Поставщик — внизу документа только краткое наименование, без скобок
        p_supp = cells[1].paragraphs[0]
        p_supp.add_run(f"{act['supplierShortName']}\n\n")
        
        # Подпись и печать Поставщика: плавающие изображения "за текстом"
        has_sig = bool(act.get('signatureImage'))
        has_stamp = bool(act.get('stampImage'))

        p_supp_name = cells[1].add_paragraph()
        p_supp_name.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_supp_name.add_run("_________________")
        p_supp_name.add_run(f" / {act['supplierRepShort']} /\n")
        p_supp_name.add_run("М.П.")

        if has_stamp:
            try:
                stamp_b64 = act['stampImage'].split("base64,")[1] if "base64," in act['stampImage'] else act['stampImage']
                stamp_bytes = base64.b64decode(stamp_b64)

                add_floating_picture_behind_text(
                    paragraph=p_supp_name,
                    image_bytes=stamp_bytes,
                    width_mm=STAMP_WIDTH_MM,
                    x_offset_mm=STAMP_OFFSET_X_MM,
                    y_offset_mm=STAMP_OFFSET_Y_MM,
                )
            except Exception as e:
                logger.error(f"Error adding floating stamp to docx: {e}", exc_info=True)

        if has_sig:
            try:
                sign_b64 = act['signatureImage'].split("base64,")[1] if "base64," in act['signatureImage'] else act['signatureImage']
                sign_bytes = base64.b64decode(sign_b64)

                add_floating_picture_behind_text(
                    paragraph=p_supp_name,
                    image_bytes=sign_bytes,
                    width_mm=SIGNATURE_WIDTH_MM,
                    x_offset_mm=SIGNATURE_OFFSET_X_MM,
                    y_offset_mm=SIGNATURE_OFFSET_Y_MM,
                )
            except Exception as e:
                logger.error(f"Error adding floating signature to docx: {e}", exc_info=True)

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

@app.delete("/api/acts")
async def delete_all_acts():
    try:
        logger.info("Deleting all acts from database")
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM attachments WHERE entityType = 'act'")
            cursor.execute("DELETE FROM acts")
            conn.commit()
        logger.info("All acts deleted successfully")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting all acts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/acts/{act_id}")
async def delete_act(act_id: str):
    try:
        logger.info(f"Deleting act: {act_id}")
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM attachments WHERE entityType = 'act' AND entityId = ?", (act_id,))
            cursor.execute("DELETE FROM acts WHERE id = ?", (act_id,))
            conn.commit()
            if cursor.rowcount == 0:
                logger.warning(f"Act {act_id} not found for deletion")
                raise HTTPException(status_code=404, detail="Act not found")
        logger.info(f"Act {act_id} deleted successfully")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting act: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/profit/export")
async def export_profit_report(onlyPaid: bool = False):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM upds")
            rows = cursor.fetchall()

            upds_list = []
            for row in rows:
                upd = dict(row)
                upd['isPaid'] = bool(upd.get('isPaid', False))
                upd['includeInProfit'] = bool(upd.get('includeInProfit', True))
                upd['purchaseAmountGross'] = float(upd.get('purchaseAmountGross') or 0)
                upd['transportAmountGross'] = float(upd.get('transportAmountGross') or 0)

                # Исключаем все строки, не участвующие в расчётах
                if not upd['includeInProfit']:
                    continue
                if onlyPaid and not upd['isPaid']:
                    continue

                upd = enrich_profit_fields(upd)
                upds_list.append(upd)

            def sort_key(u):
                date_str = u.get('updDate', '')
                try:
                    parts = date_str.split('.')
                    if len(parts) == 3:
                        date_val = f"{parts[2]}-{parts[1]}-{parts[0]}"
                    else:
                        date_val = "0000-00-00"
                except Exception:
                    date_val = "0000-00-00"
                return (date_val, u.get('updNumber', ''))

            upds_list.sort(key=sort_key)

            total_shipment = sum(u['shipmentWithoutVat'] for u in upds_list)
            total_purchase = sum(u['purchaseWithoutVat'] for u in upds_list)
            total_transport = sum(u['transportWithoutVat'] for u in upds_list)
            total_profit = sum(u['profitWithoutVat'] for u in upds_list)

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Прибыль по УПД"

            report_date = datetime.now().strftime("%d.%m.%Y %H:%M")
            filter_text = "Только оплаченные" if onlyPaid else "Все включенные в расчет"
            ws.merge_cells('A1:J1')
            title_cell = ws.cell(row=1, column=1, value=f"Отчет по прибыли УПД (от {report_date})")
            title_cell.font = Font(bold=True, size=14)
            title_cell.alignment = Alignment(horizontal='center')

            ws.cell(row=3, column=1, value="Режим отбора:").font = Font(bold=True)
            ws.cell(row=3, column=2, value=filter_text)

            ws.cell(row=4, column=1, value="Общая отгрузка без НДС:").font = Font(bold=True)
            ws.cell(row=4, column=2, value=total_shipment).number_format = '#,##0.00'

            ws.cell(row=5, column=1, value="Общая закупка без НДС:").font = Font(bold=True)
            ws.cell(row=5, column=2, value=total_purchase).number_format = '#,##0.00'

            ws.cell(row=6, column=1, value="Общий транспорт без НДС:").font = Font(bold=True)
            ws.cell(row=6, column=2, value=total_transport).number_format = '#,##0.00'

            ws.cell(row=7, column=1, value="Итоговая общая прибыль без НДС:").font = Font(bold=True)
            ws.cell(row=7, column=2, value=total_profit).number_format = '#,##0.00'

            headers = [
                "Номер УПД",
                "Дата УПД",
                "Оплачено",
                "Отгрузка с НДС",
                "Отгрузка без НДС",
                "Закупка с НДС",
                "Закупка без НДС",
                "Транспорт с НДС",
                "Транспорт без НДС",
                "Прибыль без НДС",
            ]

            header_row = 9
            for col_idx, header in enumerate(headers, start=1):
                cell = ws.cell(row=header_row, column=col_idx, value=header)
                cell.font = Font(bold=True)
                cell.alignment = Alignment(horizontal='center', vertical='center')

            for row_idx, upd in enumerate(upds_list, start=10):
                ws.cell(row=row_idx, column=1, value=upd['updNumber'])
                ws.cell(row=row_idx, column=2, value=upd['updDate'])
                ws.cell(row=row_idx, column=3, value="Да" if upd['isPaid'] else "Нет")

                ws.cell(row=row_idx, column=4, value=upd['totalAmount']).number_format = '#,##0.00'
                ws.cell(row=row_idx, column=5, value=upd['shipmentWithoutVat']).number_format = '#,##0.00'
                ws.cell(row=row_idx, column=6, value=upd['purchaseAmountGross']).number_format = '#,##0.00'
                ws.cell(row=row_idx, column=7, value=upd['purchaseWithoutVat']).number_format = '#,##0.00'
                ws.cell(row=row_idx, column=8, value=upd['transportAmountGross']).number_format = '#,##0.00'
                ws.cell(row=row_idx, column=9, value=upd['transportWithoutVat']).number_format = '#,##0.00'
                ws.cell(row=row_idx, column=10, value=upd['profitWithoutVat']).number_format = '#,##0.00'

            total_row = len(upds_list) + 11
            ws.cell(row=total_row, column=1, value="ИТОГО").font = Font(bold=True)
            ws.cell(row=total_row, column=5, value=total_shipment).font = Font(bold=True)
            ws.cell(row=total_row, column=5).number_format = '#,##0.00'
            ws.cell(row=total_row, column=7, value=total_purchase).font = Font(bold=True)
            ws.cell(row=total_row, column=7).number_format = '#,##0.00'
            ws.cell(row=total_row, column=9, value=total_transport).font = Font(bold=True)
            ws.cell(row=total_row, column=9).number_format = '#,##0.00'
            ws.cell(row=total_row, column=10, value=total_profit).font = Font(bold=True)
            ws.cell(row=total_row, column=10).number_format = '#,##0.00'

            for column_cells in ws.columns:
                max_length = 0
                column_idx = column_cells[0].column
                column_letter = get_column_letter(column_idx)

                for cell in column_cells:
                    if hasattr(cell, 'value') and cell.value is not None:
                        try:
                            max_length = max(max_length, len(str(cell.value)))
                        except Exception:
                            pass

                ws.column_dimensions[column_letter].width = max_length + 2

            fd, path = tempfile.mkstemp(suffix=".xlsx")
            os.close(fd)
            wb.save(path)

            return FileResponse(
                path,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename="profit_report.xlsx"
            )
    except Exception as e:
        logger.error(f"Error exporting profit report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backup/export")
async def export_backup():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    return FileResponse(
        DB_PATH, 
        filename=f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db",
        media_type="application/x-sqlite3"
    )

@app.post("/api/backup/import")
async def import_backup(file: UploadFile = File(...)):
    try:
        # Save the uploaded file to a temporary location first
        temp_path = f"{DB_PATH}.tmp"
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Verify it's a valid sqlite3 database
        try:
            conn = sqlite3.connect(temp_path)
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            conn.close()
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise HTTPException(status_code=400, detail=f"Invalid database file: {str(e)}")
        
        # Replace the current database
        bak_path = f"{DB_PATH}.bak"
        if os.path.exists(DB_PATH):
            # Rename existing to .bak
            if os.path.exists(bak_path):
                os.remove(bak_path)
            os.rename(DB_PATH, bak_path)
        
        try:
            os.rename(temp_path, DB_PATH)
            # If everything went well, remove the backup
            if os.path.exists(bak_path):
                os.remove(bak_path)
        except Exception as e:
            # Restore from backup if rename failed
            if os.path.exists(bak_path):
                if os.path.exists(DB_PATH):
                    os.remove(DB_PATH)
                os.rename(bak_path, DB_PATH)
            raise e
            
        return {"success": True}
    except Exception as e:
        logger.error(f"Error importing backup: {e}", exc_info=True)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settings")
async def get_settings():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        conn.close()
        
        settings = {}
        for key, value in rows:
            try:
                # Попытка распарсить JSON (например, для specification)
                settings[key] = json.loads(value)
            except json.JSONDecodeError:
                # Если не JSON, отдаем как строку
                settings[key] = value
                
        return settings
    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/settings")
async def update_settings(settings: dict):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        for key, value in settings.items():
            if value is None:
                cursor.execute("DELETE FROM settings WHERE key = ?", (key,))
            else:
                # Если значение - список или словарь, сериализуем в JSON
                if isinstance(value, (dict, list)):
                    val_str = json.dumps(value, ensure_ascii=False)
                else:
                    val_str = str(value)
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, val_str))
                
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import os
    import uvicorn

    host = os.getenv("BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("BACKEND_PORT", "8001"))
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() == "true"

    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=reload_enabled,
        log_level="info",
    )
