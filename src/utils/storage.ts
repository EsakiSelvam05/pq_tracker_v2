import { PQRecord } from '../types';

const STORAGE_KEY = 'pq_records';
const FILES_STORAGE_KEY = 'pq_files';

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

// Store file data separately
const saveFileData = async (recordId: string, file: File): Promise<void> => {
  try {
    const base64Data = await fileToBase64(file);
    const filesData = getFilesData();
    filesData[recordId] = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: base64Data
    };
    localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(filesData));
  } catch (error) {
    console.error('Error saving file data:', error);
  }
};

// Get file data
const getFilesData = (): Record<string, any> => {
  const stored = localStorage.getItem(FILES_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
};

// Get file as Blob
export const getFileAsBlob = (recordId: string): Blob | null => {
  try {
    const filesData = getFilesData();
    const fileData = filesData[recordId];
    if (!fileData) return null;
    
    return base64ToBlob(fileData.data, fileData.type);
  } catch (error) {
    console.error('Error retrieving file data:', error);
    return null;
  }
};

// Get file info
export const getFileInfo = (recordId: string): { name: string; type: string; size: number } | null => {
  try {
    const filesData = getFilesData();
    const fileData = filesData[recordId];
    if (!fileData) return null;
    
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

// Debug function to get all files data
export const getAllFilesData = (): Record<string, any> => {
  return getFilesData();
};

// Debug function to log all files data
export const logAllFilesData = (): void => {
  const filesData = getFilesData();
  console.log('=== ALL FILES DATA ===');
  console.log('Total files stored:', Object.keys(filesData).length);
  console.log('Files data:', filesData);
  
  Object.entries(filesData).forEach(([recordId, fileData]) => {
    console.log(`\n--- File for Record ID: ${recordId} ---`);
    console.log('File name:', fileData.name);
    console.log('File type:', fileData.type);
    console.log('File size:', fileData.size);
    console.log('Data length:', fileData.data ? fileData.data.length : 'No data');
  });
};
// Delete file data
const deleteFileData = (recordId: string): void => {
  const filesData = getFilesData();
  delete filesData[recordId];
  localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(filesData));
};

export const saveRecord = async (record: PQRecord): Promise<void> => {
  const records = getRecords();
  const existingIndex = records.findIndex(r => r.id === record.id);
  
  // Handle file storage separately
  if (record.uploadedInvoice instanceof File) {
    await saveFileData(record.id, record.uploadedInvoice);
    // Store only a reference to the file
    record.uploadedInvoice = 'stored_file';
  }
  
  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

export const getRecords = (): PQRecord[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const deleteRecord = (id: string): void => {
  const records = getRecords().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  // Also delete associated file data
  deleteFileData(id);
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};