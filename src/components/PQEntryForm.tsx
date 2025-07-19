import React, { useState, useEffect } from 'react';
import { PQRecord } from '../types';
import { formatDate } from '../utils/dateHelpers';
import { 
  Save, 
  X, 
  Upload, 
  FileText, 
  Building, 
  User, 
  Package, 
  MapPin, 
  Calendar,
  FileSpreadsheet,
  Eye,
  Download,
  Trash2,
  Info,
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveRecord, generateId, getFileAsBlob, getFileInfo, logAllFilesData, migrateFromLocalStorage } from '../utils/supabaseStorage';

interface PQEntryFormProps {
  editRecord?: PQRecord;
  onSave: () => void;
  onCancel?: () => void;
}

const PQEntryForm: React.FC<PQEntryFormProps> = ({ editRecord, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Omit<PQRecord, 'id' | 'createdAt'>>({
    date: formatDate(new Date()),
    shipperName: '',
    buyer: '',
    invoiceNumber: '',
    commodity: '',
    shippingBillReceived: false,
    pqStatus: 'Pending',
    pqHardcopy: 'Not Received',
    permitCopyStatus: 'Not Required',
    destinationPort: '',
    remarks: '',
    uploadedInvoice: undefined
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    fileName: string;
    fileUrl: string;
  } | null>(null);

  useEffect(() => {
    if (editRecord) {
      setFormData({
        date: editRecord.date,
        shipperName: editRecord.shipperName,
        buyer: editRecord.buyer,
        invoiceNumber: editRecord.invoiceNumber,
        commodity: editRecord.commodity,
        shippingBillReceived: editRecord.shippingBillReceived,
        pqStatus: editRecord.pqStatus,
        pqHardcopy: editRecord.pqHardcopy || 'Not Received',
        permitCopyStatus: editRecord.permitCopyStatus,
        destinationPort: editRecord.destinationPort,
        remarks: editRecord.remarks,
        uploadedInvoice: editRecord.uploadedInvoice
      });
    }
  }, [editRecord]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Auto-analyze file data when uploaded
  const analyzeFileData = async (file: File) => {
    try {
      console.log('=== STARTING FILE ANALYSIS ===');
      console.log('File name:', file.name);
      console.log('File size:', file.size);
      console.log('File type:', file.type);
      
      const fileName = file.name.toLowerCase();
      console.log('Lowercase filename:', fileName);
      
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.includes('excel')) {
        console.log('✅ File detected as Excel format');
        
        const data = await file.arrayBuffer();
        console.log('✅ File read as ArrayBuffer, size:', data.byteLength);
        
        const workbook = XLSX.read(data);
        console.log('✅ Workbook created, sheets:', workbook.SheetNames);
        
        const sheetName = workbook.SheetNames[0];
        console.log('Using sheet:', sheetName);
        
        const worksheet = workbook.Sheets[sheetName];
        console.log('✅ Worksheet loaded');
        
        // Get the range to understand the data structure
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
        console.log('Sheet range:', range);
        console.log('Rows:', range.e.r + 1, 'Columns:', range.e.c + 1);
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1, 
          defval: '',
          raw: false // This ensures dates and numbers are converted to strings
        });
        
        console.log('✅ JSON data extracted, rows:', jsonData.length);
        console.log('Raw JSON data:', jsonData);
        
        // Auto-populate fields based on Excel data
        if (jsonData.length > 1) {
          const headers = jsonData[0] as string[];
          const firstRow = jsonData[1] as any[];
          
          const updates: Partial<typeof formData> = {};
          
          console.log('=== PROCESSING HEADERS AND DATA ===');
          console.log('Headers array:', headers);
          console.log('Headers length:', headers.length);
          console.log('First row array:', firstRow);
          console.log('First row length:', firstRow.length);
          
          headers.forEach((header, index) => {
            console.log(`\n--- Processing column ${index} ---`);
            console.log('Header:', header);
            console.log('Header type:', typeof header);
            
            if (!header || index >= firstRow.length) {
              console.log('❌ Skipping - no header or no data at index', index);
              return;
            }
            
            const value = firstRow[index]?.toString().trim() || '';
            console.log('Raw value:', firstRow[index]);
            console.log('Processed value:', value);
            console.log('Value type:', typeof firstRow[index]);
            
            if (!value) {
              console.log('❌ Skipping - empty value');
              return;
            }
            
            const lowerHeader = header.toString().toLowerCase().trim();
            console.log('Lowercase header:', lowerHeader);
            
            // Invoice Number matching
            if ((lowerHeader.includes('invoice') && (lowerHeader.includes('number') || lowerHeader.includes('no') || lowerHeader.includes('#'))) ||
                lowerHeader === 'invoice' || 
                lowerHeader === 'invoice_number' || 
                lowerHeader === 'invoiceno' ||
                lowerHeader === 'invoice no' ||
                lowerHeader === 'invoice number') {
              console.log('✅ MATCHED: Invoice Number');
              updates.invoiceNumber = value;
            }
            
            // Shipper matching
            else if (lowerHeader.includes('shipper') || lowerHeader.includes('exporter') || lowerHeader.includes('seller')) {
              console.log('✅ MATCHED: Shipper Name');
              updates.shipperName = value;
            } else if (lowerHeader === 'shipper' || lowerHeader === 'exporter' || lowerHeader === 'shipper_name') {
              console.log('✅ MATCHED: Shipper Name (exact)');
              updates.shipperName = value;
            }
            
            // Buyer matching
            else if (lowerHeader.includes('buyer') || lowerHeader.includes('importer') || lowerHeader.includes('consignee')) {
              console.log('✅ MATCHED: Buyer');
              updates.buyer = value;
            } else if (lowerHeader === 'buyer' || lowerHeader === 'importer' || lowerHeader === 'buyer_name') {
              console.log('✅ MATCHED: Buyer (exact)');
              updates.buyer = value;
            }
            
            // Commodity matching
            else if (lowerHeader.includes('commodity') || lowerHeader.includes('product') || lowerHeader.includes('goods') || lowerHeader.includes('description')) {
              console.log('✅ MATCHED: Commodity');
              updates.commodity = value;
            } else if (lowerHeader === 'commodity' || lowerHeader === 'product' || lowerHeader === 'description') {
              console.log('✅ MATCHED: Commodity (exact)');
              updates.commodity = value;
            }
            
            // Enhanced Destination matching
            else if (lowerHeader.includes('destination') || 
                     lowerHeader.includes('country') || 
                     lowerHeader.includes('port') ||
                     lowerHeader.includes('dest') || 
                     lowerHeader.includes('discharge') || 
                     lowerHeader.includes('final') || 
                     lowerHeader.includes('delivery') ||
                     lowerHeader.includes('consignee country') ||
                     lowerHeader.includes('import country') ||
                     lowerHeader.includes('receiving country') ||
                     lowerHeader.includes('target country') ||
                     lowerHeader.includes('end country')) {
              console.log('✅ MATCHED: Destination Country (partial)');
              updates.destinationPort = value;
            } else if (lowerHeader === 'destination' || 
                       lowerHeader === 'country' || 
                       lowerHeader === 'destination_country' ||
                       lowerHeader === 'dest' || 
                       lowerHeader === 'dest_country' || 
                       lowerHeader === 'destination_port' ||
                       lowerHeader === 'discharge_port' ||
                       lowerHeader === 'final_destination' ||
                       lowerHeader === 'delivery_country' ||
                       lowerHeader === 'import_country' ||
                       lowerHeader === 'receiving_country' ||
                       lowerHeader === 'target_country' ||
                       lowerHeader === 'end_country' ||
                       lowerHeader === 'country_of_destination' ||
                       lowerHeader === 'country_destination' ||
                       lowerHeader === 'countryofdestination') {
              console.log('✅ MATCHED: Destination Country (exact)');
              updates.destinationPort = value;
            }
            
            // Date matching
            else if (lowerHeader.includes('date') && !lowerHeader.includes('due') && !lowerHeader.includes('expiry')) {
              console.log('✅ MATCHED: Date field');
              try {
                // Try multiple date formats
                let dateValue;
                if (value.includes('/')) {
                  dateValue = new Date(value);
                } else if (value.includes('-')) {
                  dateValue = new Date(value);
                } else if (!isNaN(Number(value))) {
                  // Excel serial date
                  dateValue = new Date((Number(value) - 25569) * 86400 * 1000);
                } else {
                  dateValue = new Date(value);
                }
                
                if (!isNaN(dateValue.getTime())) {
                  updates.date = formatDate(dateValue);
                  console.log('✅ Date parsed successfully:', updates.date);
                }
              } catch (error) {
                console.log('❌ Date parsing error:', error);
              }
            } else {
              console.log('❌ No match found for header:', lowerHeader);
            }
          });
          
          console.log('\n=== FINAL UPDATES ===');
          console.log('Updates object:', updates);
          console.log('Number of fields to update:', Object.keys(updates).length);
          
          // Apply updates
          if (Object.keys(updates).length > 0) {
            console.log('✅ Applying updates to form...');
            setFormData(prev => {
              const newData = { ...prev, ...updates };
              console.log('Previous form data:', prev);
              console.log('New form data:', newData);
              return newData;
            });
          } else {
            console.log('❌ No updates to apply');
          }
          
          // Show success message with details
          const updatedFields = Object.keys(updates);
          if (updatedFields.length > 0) {
            const fieldNames = updatedFields.map(field => {
              switch(field) {
                case 'invoiceNumber': return 'Invoice Number';
                case 'shipperName': return 'Shipper Name';
                case 'buyer': return 'Buyer Name';
                case 'commodity': return 'Commodity';
                case 'destinationPort': return 'Destination Country';
                case 'date': return 'Date';
                default: return field;
              }
            });
            alert(`✅ File analyzed successfully!\n\nAuto-populated fields:\n${fieldNames.map(field => `• ${field}`).join('\n')}\n\nPlease review and complete any remaining fields.`);
          } else {
            console.log('Available headers were:', headers);
            alert(`📄 File uploaded successfully, but no matching data fields were found.\n\nFound headers: ${headers.join(', ')}\n\nPlease ensure your Excel file has headers like:\n• Invoice Number\n• Shipper Name\n• Buyer Name\n• Commodity\n• Destination Country\n• Date`);
          }
        } else {
          console.log('❌ Excel file has insufficient data rows');
          alert('📄 Excel file appears to be empty or has no data rows.\n\nPlease upload a file with headers and data.');
        }
      } else {
        console.log('❌ File is not Excel format');
        // For non-Excel files, just show upload success
        alert('📎 File uploaded successfully!\n\nAuto-analysis is only available for Excel files (.xlsx, .xls).\nPlease fill the form manually.');
      }
    } catch (error) {
      console.error('Error analyzing file:', error);
      console.error('Error stack:', error.stack);
      alert('❌ Error analyzing file data.\n\nPlease ensure the file is a valid Excel format and try again.\nYou can still fill the form manually.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ 
        ...prev, 
        uploadedInvoice: file 
      }));
      
      // Auto-analyze the uploaded file
      await analyzeFileData(file);
    }
  };

  const handlePreviewFile = () => {
    const file = formData.uploadedInvoice;
    if (file && file instanceof File) {
      const fileUrl = URL.createObjectURL(file);
      setPreviewFile({
        fileName: file.name,
        fileUrl: fileUrl
      });
    }
  };

  const handleDownloadFile = () => {
    const file = formData.uploadedInvoice;
    if (file && file instanceof File) {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleDeleteFile = () => {
    if (window.confirm('Are you sure you want to delete this invoice file?')) {
      setFormData(prev => ({ 
        ...prev, 
        uploadedInvoice: undefined 
      }));
    }
  };

  const closePreview = () => {
    if (previewFile?.fileUrl) {
      URL.revokeObjectURL(previewFile.fileUrl);
    }
    setPreviewFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const record: PQRecord = {
        id: editRecord?.id || generateId(),
        ...formData,
        createdAt: editRecord?.createdAt || Date.now()
      };

      await saveRecord(record);
      
      // Reset form if creating new record
      if (!editRecord) {
        setFormData({
          date: formatDate(new Date()),
          shipperName: '',
          buyer: '',
          invoiceNumber: '',
          commodity: '',
          shippingBillReceived: false,
          pqStatus: 'Pending',
          pqHardcopy: 'Not Received',
          permitCopyStatus: 'Not Required',
          destinationPort: '',
          remarks: '',
          uploadedInvoice: undefined
        });
      }

      onSave();
    } catch (error) {
      console.error('Error saving record:', error);
      alert('Error saving record. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMigrateData = async () => {
    if (window.confirm('This will migrate all data from localStorage to Supabase. Continue?')) {
      try {
        await migrateFromLocalStorage();
        alert('✅ Data migration completed successfully!\n\nAll records have been moved to Supabase database.');
        onSave(); // Refresh the data
      } catch (error) {
        console.error('Migration error:', error);
        alert('❌ Error during migration. Please check the console for details.');
      }
    }
  };

  const handleShowFilesData = () => {
    logAllFilesData();
    alert('Files data has been logged to the browser console. Press F12 and check the Console tab to see the information.');
  };

  const renderFileUploadSection = () => {
    const hasFile = formData.uploadedInvoice instanceof File || (typeof formData.uploadedInvoice === 'string' && formData.uploadedInvoice !== '');
    
    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Invoice File (Auto-Analysis)</h3>
        </div>
        
        {!hasFile ? (
          <div className="relative">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="invoice-upload"
            />
            <label
              htmlFor="invoice-upload"
              className="group relative overflow-hidden flex items-center justify-center w-full p-8 border-2 border-dashed border-gray-300 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 hover:from-blue-50 hover:to-purple-50 hover:border-blue-400 transition-all duration-300 cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-purple-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative text-center space-y-3">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900 group-hover:text-blue-700 transition-colors duration-300">
                    Upload Invoice File
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Auto-analyzes Excel files and fills form data
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Supports: PDF, JPG, PNG, XLS, XLSX, DOC, DOCX
                  </p>
                </div>
              </div>
            </label>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 border-2 border-green-300 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {formData.uploadedInvoice instanceof File ? formData.uploadedInvoice.name : 'Invoice File uploaded'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formData.uploadedInvoice instanceof File ? `${(formData.uploadedInvoice.size / 1024).toFixed(1)} KB` : 'File attached'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {formData.uploadedInvoice instanceof File && (
                  <>
                    <button
                      type="button"
                      onClick={handlePreviewFile}
                      className="group relative overflow-hidden p-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg transform hover:scale-110 transition-all duration-300"
                      title="Preview file"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                      <Eye size={16} className="relative" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleDownloadFile}
                      className="group relative overflow-hidden p-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg transform hover:scale-110 transition-all duration-300"
                      title="Download file"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                      <Download size={16} className="relative" />
                    </button>
                  </>
                )}
                
                <button
                  type="button"
                  onClick={handleDeleteFile}
                  className="group relative overflow-hidden p-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl shadow-lg transform hover:scale-110 transition-all duration-300"
                  title="Delete file"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                  <Trash2 size={16} className="relative" />
                </button>
                
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="invoice-replace"
                  />
                  <label
                    htmlFor="invoice-replace"
                    className="group relative overflow-hidden p-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl shadow-lg transform hover:scale-110 transition-all duration-300 cursor-pointer flex items-center"
                    title="Replace file"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                    <Upload size={16} className="relative" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-100 to-teal-100 rounded-full">
          <FileText className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-gray-700">
            {editRecord ? 'Edit Record' : 'New Entry'}
          </span>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        </div>
        <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-green-800 to-teal-800 bg-clip-text text-transparent">
          {editRecord ? 'Edit PQ Record' : 'PQ Certificate Entry'}
        </h2>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          {editRecord ? 'Update the PQ certificate information' : 'Upload Excel file for auto-analysis or enter PQ certificate information manually'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 space-y-8">
        {/* Invoice Upload Section - At Top */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
            <div className="p-2 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Invoice File Upload & Auto-Analysis</h3>
          </div>
          
          {renderFileUploadSection()}
        </div>

        {/* Basic Information */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
            <div className="p-2 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Basic Information</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Date *</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                required
                className="form-input"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Invoice Number *</label>
              <input
                type="text"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleInputChange}
                required
                placeholder="Enter invoice number"
                className="form-input"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Destination Country *</label>
              <input
                type="text"
                name="destinationPort"
                value={formData.destinationPort}
                onChange={handleInputChange}
                required
                placeholder="Enter destination country"
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Company Information */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
            <div className="p-2 bg-gradient-to-r from-green-100 to-emerald-100 rounded-xl">
              <Building className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Company Information</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Shipper Name *</label>
              <input
                type="text"
                name="shipperName"
                value={formData.shipperName}
                onChange={handleInputChange}
                required
                placeholder="Enter shipper name"
                className="form-input"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Buyer Name *</label>
              <input
                type="text"
                name="buyer"
                value={formData.buyer}
                onChange={handleInputChange}
                required
                placeholder="Enter buyer name"
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Product Information */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
            <div className="p-2 bg-gradient-to-r from-orange-100 to-red-100 rounded-xl">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Product Information</h3>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Commodity *</label>
            <textarea
              name="commodity"
              value={formData.commodity}
              onChange={handleInputChange}
              required
              rows={3}
              placeholder="Enter commodity details"
              className="form-input resize-none"
            />
          </div>
        </div>

        {/* Status Information */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
            <div className="p-2 bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl">
              <User className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Status Information</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl border border-blue-200">
              <label className="text-sm font-semibold text-gray-700">Shipping Bill Copy</label>
              <select
                name="shippingBillReceived"
                value={formData.shippingBillReceived ? 'Yes' : 'No'}
                onChange={(e) => setFormData(prev => ({ ...prev, shippingBillReceived: e.target.value === 'Yes' }))}
                className="w-full px-3 py-2 bg-white/80 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            
            <div className="space-y-2 p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl border border-purple-200">
              <label className="text-sm font-semibold text-gray-700">PQ Status</label>
              <select
                name="pqStatus"
                value={formData.pqStatus}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white/80 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="Pending">Pending</option>
                <option value="Received">Received</option>
              </select>
            </div>
            
            <div className="space-y-2 p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl border border-green-200">
              <label className="text-sm font-semibold text-gray-700">PQ Hardcopy</label>
              <select
                name="pqHardcopy"
                value={formData.pqHardcopy}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white/80 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="Not Received">Not Received</option>
                <option value="Received">Received</option>
              </select>
            </div>
            
            <div className="space-y-2 p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl border border-orange-200">
              <label className="text-sm font-semibold text-gray-700">Permit Copy Status</label>
              <select
                name="permitCopyStatus"
                value={formData.permitCopyStatus}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white/80 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="Not Required">Not Required</option>
                <option value="Not Received">Not Received</option>
                <option value="Received">Received</option>
              </select>
            </div>
          </div>
        </div>

        {/* Remarks */}
        <div className="space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
            <div className="p-2 bg-gradient-to-r from-gray-100 to-slate-100 rounded-xl">
              <FileText className="w-6 h-6 text-gray-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Additional Information</h3>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleInputChange}
              rows={4}
              placeholder="Enter any additional remarks or notes"
              className="form-input resize-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-8 border-t border-gray-200">
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={handleMigrateData}
              className="group relative overflow-hidden px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-2xl font-semibold shadow-2xl shadow-purple-500/25 transform hover:scale-105 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              <div className="relative flex items-center space-x-2">
                <Database size={18} />
                <span>Migrate Data</span>
              </div>
            </button>
            
            <button
              type="button"
              onClick={handleShowFilesData}
              className="group relative overflow-hidden px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl font-semibold shadow-2xl shadow-blue-500/25 transform hover:scale-105 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              <div className="relative flex items-center space-x-2">
                <Info size={18} />
                <span>Show Files Data</span>
              </div>
            </button>
            
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="group relative overflow-hidden px-8 py-4 bg-gradient-to-r from-gray-500 to-slate-600 text-white rounded-2xl font-semibold shadow-2xl shadow-gray-500/25 transform hover:scale-105 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                <div className="relative flex items-center space-x-2">
                  <X size={20} />
                  <span>Cancel</span>
                </div>
              </button>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting}
            className="group relative overflow-hidden px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-semibold shadow-2xl shadow-green-500/25 transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            <div className="relative flex items-center space-x-2">
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={20} />
                  <span>{editRecord ? 'Update Record' : 'Save Record'}</span>
                </>
              )}
            </div>
          </button>
        </div>
      </form>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-6xl max-h-[90vh] w-full overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Invoice File Preview</h3>
                  <p className="text-sm text-gray-600">{previewFile.fileName}</p>
                </div>
              </div>
              <button
                onClick={closePreview}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors duration-200"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 max-h-[80vh] overflow-auto">
              {previewFile.fileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewFile.fileUrl}
                  className="w-full h-[75vh] border border-gray-200 rounded-xl"
                  title="File Preview"
                />
              ) : previewFile.fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/i) ? (
                <div className="flex justify-center">
                  <img
                    src={previewFile.fileUrl}
                    alt="File Preview"
                    className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg"
                  />
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="w-24 h-24 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileSpreadsheet className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Preview Not Available</h3>
                  <p className="text-gray-500 mb-6">This file type cannot be previewed in the browser.</p>
                  <button
                    onClick={handleDownloadFile}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-300"
                  >
                    <div className="flex items-center space-x-2">
                      <Download size={18} />
                      <span>Download to View</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PQEntryForm;