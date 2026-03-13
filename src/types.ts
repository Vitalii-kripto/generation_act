export interface Attachment {
  id: string;
  entityType: 'upd' | 'act';
  entityId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy?: string;
  comment?: string;
  data?: string; // Only present when downloading
}

export interface SpecificationItem {
  id: string;
  specNumber: string;
  name: string;
  unit: string;
  quantity: number;
  priceWithVat: number;
  totalWithVat: number;
  country: string;
}

export interface ActItem {
  id: string;
  specNumber?: string;
  name: string;
  unit: string;
  quantity: number;
  priceWithVat: number;
  totalWithVat: number;
  country: string;
  priceMismatch?: boolean;
}

export interface UpdDetail {
  number: string;
  date: string;
  amount: number;
}

export interface UpdItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  priceWithVat: number;
  totalWithVat: number;
  country?: string;
  specNumber?: string;
}

export interface UpdResponse {
  id: string;
  updNumber: string;
  updDate: string;
  supplierName: string;
  customerName: string;
  items: UpdItem[];
  totalAmount: number;
  vatAmount: number;
  vatRate: number;
  source?: string;
  isUsedInAct?: boolean;
  isPaid?: boolean;
  createdAt?: string;
  acceptanceDate: string;
  paymentDate: string;
  daysUntilPayment: number;
  status: 'green' | 'yellow' | 'red';
  attachmentsCount?: number;
}


export interface Act {
  id: string;
  actNumber: number;
  actDate: string;
  contractNumber: string;
  contractDate: string;
  updNumber: string;
  updDate: string;
  updDetails?: UpdDetail[];
  supplierName: string;
  supplierRep: string;
  supplierBasis: string;
  supplierShortName: string;
  supplierRepShort: string;
  customerName: string;
  customerRep: string;
  customerBasis: string;
  customerShortName: string;
  customerRepShort: string;
  items: ActItem[];
  totalAmount: number;
  vatAmount: number;
  vatRate: number;
  objectName: string;
  deliveryTerm: string;
  actualDeliveryDate: string;
  expertise: string;
  penalty: string;
  signatureImage?: string | null;
  stampImage?: string | null;
  attachmentsCount?: number;
}
