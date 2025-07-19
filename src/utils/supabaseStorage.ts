import { supabase } from '../lib/supabase';
import { PQRecord } from '../types';

// Helper function to convert File to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

// Helper function to convert base64 to Blob
const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64.split(',')[1]);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

// Convert PQRecord to database format
const toDbFormat = (record: PQRecord) => {
  return {
    id: record.id,
    date: record.date,
    shipper_name: record.shipperName,
    buyer: record.buyer,
    invoice_number: record.invoiceNumber,
    commodity: record.commodity,
    shipping_bill_received: record.shippingBillReceived === 'Yes' || record.shippingBillReceived === true,
    pq_status: record.pqStatus,
    pq_hardcopy: record.pqHardcopy,
    permit_copy_status: record.permitCopyStatus,
    destination_port: record.destinationPort,
    remarks: record.remarks,
    files: null // Will be set separately if there's a file
  };
};

// Convert database record to PQRecord format
const fromDbFormat = (dbRecord: any): PQRecord => {
  return {
    id: dbRecord.id,
    date: dbRecord.date,
    shipperName: dbRecord.shipper_name,
    buyer: dbRecord.buyer,
    invoiceNumber: dbRecord.invoice_number,
    commodity: dbRecord.commodity,
    shippingBillReceived: dbRecord.shipping_bill_received,
    pqStatus: dbRecord.pq_status,
    pqHardcopy: dbRecord.pq_hardcopy,
    permitCopyStatus: dbRecord.permit_copy_status,
    destinationPort: dbRecord.destination_port,
    remarks: dbRecord.remarks,
    uploadedInvoice: dbRecord.files ? 'stored_file' : undefined,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at
  };
};

export const saveRecord = async (record: PQRecord): Promise<void> => {
  try {
    const dbRecord = toDbFormat(record);
    
    // Handle file storage
    if (record.uploadedInvoice instanceof File) {
      const base64Data = await fileToBase64(record.uploadedInvoice);
      dbRecord.files = {
        name: record.uploadedInvoice.name,
        type: record.uploadedInvoice.type,
        size: record.uploadedInvoice.size,
        data: base64Data
      };
    }

    // Check if record exists
    const { data: existingRecord } = await supabase
      .from('pq_records')
      .select('id')
      .eq('id', record.id)
      .single();

    if (existingRecord) {
      // Update existing record
      const { error } = await supabase
        .from('pq_records')
        .update(dbRecord)
        .eq('id', record.id);

      if (error) {
        console.error('Error updating record:', error);
        throw new Error(`Failed to update record: ${error.message}`);
      }
    } else {
      // Insert new record
      const { error } = await supabase
        .from('pq_records')
        .insert(dbRecord);

      if (error) {
        console.error('Error inserting record:', error);
        throw new Error(`Failed to save record: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error in saveRecord:', error);
    throw error;
  }
};

export const getRecords = async (): Promise<PQRecord[]> => {
  try {
    const { data, error } = await supabase
      .from('pq_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching records:', error);
      throw new Error(`Failed to fetch records: ${error.message}`);
    }

    return (data || []).map(fromDbFormat);
  } catch (error) {
    console.error('Error in getRecords:', error);
    throw error;
  }
};

export const deleteRecord = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('pq_records')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting record:', error);
      throw new Error(`Failed to delete record: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in deleteRecord:', error);
    throw error;
  }
};

export const generateId = (): string => {
  return crypto.randomUUID();
};

// Get file as Blob from database
export const getFileAsBlob = async (recordId: string): Promise<Blob | null> => {
  try {
    const { data, error } = await supabase
      .from('pq_records')
      .select('files')
      .eq('id', recordId)
      .single();

    if (error || !data?.files) {
      return null;
    }

    const fileData = data.files;
    return base64ToBlob(fileData.data, fileData.type);
  } catch (error) {
    console.error('Error retrieving file data:', error);
    return null;
  }
};

// Get file info from database
export const getFileInfo = async (recordId: string): Promise<{ name: string; type: string; size: number } | null> => {
  try {
    const { data, error } = await supabase
      .from('pq_records')
      .select('files')
      .eq('id', recordId)
      .single();

    if (error || !data?.files) {
      return null;
    }

    const fileData = data.files;
    return {
      name: fileData.name,
      type: fileData.type,
      size: fileData.size
    };
  } catch (error) {
    console.error('Error retrieving file info:', error);
    return null;
  }
};

// Migration function to move data from localStorage to Supabase
export const migrateFromLocalStorage = async (): Promise<void> => {
  try {
    // Get data from localStorage
    const localRecords = localStorage.getItem('pq_records');
    const localFiles = localStorage.getItem('pq_files');
    
    if (!localRecords) {
      console.log('No local records found to migrate');
      return;
    }

    const records = JSON.parse(localRecords);
    const filesData = localFiles ? JSON.parse(localFiles) : {};

    console.log(`Migrating ${records.length} records from localStorage to Supabase...`);

    for (const record of records) {
      try {
        // Convert old format to new format
        const migratedRecord: PQRecord = {
          id: record.id,
          date: record.date,
          shipperName: record.shipperName,
          buyer: record.buyer,
          invoiceNumber: record.invoiceNumber,
          commodity: record.commodity,
          shippingBillReceived: record.shippingBillReceived === 'Yes',
          pqStatus: record.pqStatus,
          pqHardcopy: record.pqHardcopy || 'Not Received',
          permitCopyStatus: record.permitCopyStatus,
          destinationPort: record.destinationPort,
          remarks: record.remarks,
          createdAt: new Date(record.createdAt).toISOString()
        };

        // Handle file data if exists
        if (record.uploadedInvoice === 'stored_file' && filesData[record.id]) {
          const fileData = filesData[record.id];
          migratedRecord.uploadedInvoice = 'stored_file';
        }

        const dbRecord = toDbFormat(migratedRecord);
        
        // Add file data if exists
        if (filesData[record.id]) {
          dbRecord.files = filesData[record.id];
        }

        // Insert into Supabase
        const { error } = await supabase
          .from('pq_records')
          .insert(dbRecord);

        if (error) {
          console.error(`Error migrating record ${record.id}:`, error);
        } else {
          console.log(`Successfully migrated record: ${record.invoiceNumber}`);
        }
      } catch (recordError) {
        console.error(`Error processing record ${record.id}:`, recordError);
      }
    }

    console.log('Migration completed!');
    
    // Optionally clear localStorage after successful migration
    // localStorage.removeItem('pq_records');
    // localStorage.removeItem('pq_files');
    
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
};

// Debug functions
export const getAllFilesData = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('pq_records')
      .select('id, invoice_number, files')
      .not('files', 'is', null);

    if (error) {
      console.error('Error fetching files data:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllFilesData:', error);
    return [];
  }
};

export const logAllFilesData = async (): Promise<void> => {
  try {
    const filesData = await getAllFilesData();
    console.log('=== ALL FILES DATA FROM SUPABASE ===');
    console.log('Total files stored:', filesData.length);
    console.log('Files data:', filesData);
    
    filesData.forEach((record) => {
      console.log(`\n--- File for Record ID: ${record.id} ---`);
      console.log('Invoice Number:', record.invoice_number);
      if (record.files) {
        console.log('File name:', record.files.name);
        console.log('File type:', record.files.type);
        console.log('File size:', record.files.size);
        console.log('Data length:', record.files.data ? record.files.data.length : 'No data');
      }
    });
  } catch (error) {
    console.error('Error logging files data:', error);
  }
};