export interface PQRecord {
  id: string;
  date: string | null;
  shipperName: string;
  buyer: string;
  invoiceNumber: string;
  commodity: string;
  shippingBillReceived: boolean | null;
  pqStatus: string | null;
  pqHardcopy: string | null;
  permitCopyStatus: string | null;
  destinationPort: string | null;
  remarks: string | null;
  uploadedInvoice?: File | string;
  createdAt: string;
  updatedAt?: string;
}

export interface FilterOptions {
  dateRange?: { start: string; end: string };
  shipperName?: string;
  buyer?: string;
  invoiceNumber?: string;
  pqStatus?: string | null;
  pqHardcopy?: string | null;
  destinationPort?: string;
  shippingBillReceived?: boolean | null;
  permitCopyStatus?: string | null;
}

export interface DashboardStats {
  totalContainers: number;
  pendingPQ: number;
  certificatesReceived: number;
  pqHardcopyMissing: number; // NEW STAT
  delaysOver48Hours: number;
}