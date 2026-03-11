import requests
import json
import uuid

url = "http://127.0.0.1:8001/api/acts"
data = {
    "id": str(uuid.uuid4()),
    "actNumber": 999,
    "actDate": "11.03.2026",
    "contractNumber": "TEST-123",
    "contractDate": "01.01.2026",
    "updNumber": "UPD-123",
    "updDate": "11.03.2026",
    "objectName": "Test Object",
    "deliveryTerm": "Test Term",
    "actualDeliveryDate": "11.03.2026",
    "customerName": "Test Customer",
    "customerShortName": "TC",
    "customerRep": "Test Rep",
    "customerBasis": "Test Basis",
    "customerRepShort": "T. Rep",
    "supplierName": "Test Supplier",
    "supplierShortName": "TS",
    "supplierRep": "Test Rep",
    "supplierBasis": "Test Basis",
    "supplierRepShort": "T. Rep",
    "totalAmount": 1000.0,
    "vatRate": 20.0,
    "vatAmount": 200.0,
    "items": [
        {
            "id": str(uuid.uuid4()),
            "name": "Test Item",
            "unit": "шт",
            "quantity": 1.0,
            "priceWithVat": 1000.0,
            "totalWithVat": 1000.0
        }
    ]
}

try:
    response = requests.post(url, json=data)
    print(f"Status: {response.status_code}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")
