import React, { useState, useMemo, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle, 
  Clock, 
  Download, 
  Edit, 
  Trash2, 
  Filter, 
  Search, 
  X, 
  FileDown, 
  FileSpreadsheet, 
  Grid, 
  List, 
  Sparkles, 
  Award,
  Check
} from 'lucide-react';
import { PQRecord, FilterOptions } from '../types';
import { deleteRecord, saveRecord, getFileAsBlob, getFileInfo } from '../utils/supabaseStorage';
import { isDelayed, getHoursElapsed } from '../utils/dateHelpers';
import { exportToExcel, exportToPDF } from '../utils/export';

interface RecordsViewProps {
  records: PQRecord[];
  onEdit: (record: PQRecord) => void;
  onRecordsChange: () => void;
  initialFilter?: { pqStatus?: string; pqHardcopy?: string };
  onFilterChange?: (filter: { pqStatus?: string; pqHardcopy?: string }) => void;
}

const RecordsView: React.FC<RecordsViewProps> = ({ 
  records, 
  onEdit, 
  onRecordsChange, 
  initialFilter = {},
  onFilterChange 
}) => {
  const [filters, setFilters] = useState<FilterOptions>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<keyof PQRecord>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeSection, setActiveSection] = useState<'all' | 'pending' | 'received' | 'hardcopyMissing'>('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [viewMode, setViewMode] = useState<'details' | 'list'>('details');

  // Get unique shipper names for dropdown
  const uniqueShipperNames = useMemo(() => {
    const shipperNames = records
      .map(record => record.shipperName)
      .filter(name => name && name.trim() !== '')
      .sort();
    
    // Remove duplicates
    return [...new Set(shipperNames)];
  }, [records]);

  useEffect(() => {
    if (initialFilter.pqStatus) {
      if (initialFilter.pqStatus === 'incomplete') {
        // Show all incomplete records (pending PQ certificates)
        setActiveSection('pending');
        setFilters({}); // Don't set specific pqStatus filter, let the section handle it
      } else if (initialFilter.pqStatus === 'Pending') {
        setActiveSection('pending');
        setFilters({ pqStatus: initialFilter.pqStatus });
      } else if (initialFilter.pqStatus === 'Received') {
        setActiveSection('received');
        setFilters({ pqStatus: initialFilter.pqStatus });
      }
    } else if (initialFilter.pqHardcopy) {
      if (initialFilter.pqHardcopy === 'Not Received') {
        setActiveSection('hardcopyMissing');
        setFilters({ pqHardcopy: initialFilter.pqHardcopy });
      }
    }
  }, [initialFilter]);

  const filteredAndSortedRecords = useMemo(() => {
    let filtered = records.filter(record => {
      const matchesSearch = !searchTerm || 
        Object.values(record).some(value => 
          typeof value === 'string' && value.toLowerCase().includes(searchTerm.toLowerCase())
        );

      const matchesFilters = Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        return record[key as keyof PQRecord] === value;
      });

      const matchesDateRange = (!dateRange.start || record.date >= dateRange.start) &&
                              (!dateRange.end || record.date <= dateRange.end);

      let matchesSection = true;
      if (activeSection === 'pending') {
        // Show all incomplete records (same logic as dashboard)
        const shippingBill = record.shippingBillReceived;
        const pqStatus = record.pqStatus;
        const permitStatus = record.permitCopyStatus;
        
        // Complete scenario: Shipping Bill = Yes, PQ Status = Received, Permit = Received OR Not Required
        const isComplete = shippingBill === true && 
                          pqStatus === 'Received' && 
                          (permitStatus === 'Received' || permitStatus === 'Not Required');
        
        matchesSection = !isComplete; // Show incomplete records
      } else if (activeSection === 'received') {
        // Show only complete records
        const shippingBill = record.shippingBillReceived;
        const pqStatus = record.pqStatus;
        const permitStatus = record.permitCopyStatus;
        
        matchesSection = shippingBill === true && 
                        pqStatus === 'Received' && 
                        (permitStatus === 'Received' || permitStatus === 'Not Required');
      } else if (activeSection === 'hardcopyMissing') {
        // Show only PQ Hardcopy Missing records
        matchesSection = (record.pqHardcopy || 'Not Received') === 'Not Received';
      }
      // activeSection === 'all' shows everything

      return matchesSearch && matchesFilters && matchesDateRange && matchesSection;
    });

    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      // Special handling for date sorting to ensure latest entries appear first by default
      if (sortBy === 'createdAt' || sortBy === 'date') {
        if (sortBy === 'date') {
          aValue = new Date(a.date).getTime();
          bValue = new Date(b.date).getTime();
        }
      }
      
      const modifier = sortOrder === 'asc' ? 1 : -1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * modifier;
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * modifier;
      }
      return 0;
    });

    return filtered;
  }, [records, filters, searchTerm, sortBy, sortOrder, activeSection, dateRange]);

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      deleteRecord(id);
      onRecordsChange();
    }
  };

  const handleMarkCompleted = (record: PQRecord) => {
    if (window.confirm('Mark this PQ as completed? This will set Shipping Bill to "Yes" and PQ Status to "Received".')) {
      const updatedRecord: PQRecord = {
        ...record,
        shippingBillReceived: true,
        pqStatus: 'Received'
      };
      
      saveRecord(updatedRecord);
      onRecordsChange();
    }
  };

  const handleDownloadInvoice = (record: PQRecord) => {
    const downloadFile = async () => {
      try {
      // Check if record has uploaded invoice
      if (!record.uploadedInvoice) {
        alert('No invoice file available for download');
        return;
      }

      // Get file info first
      const fileInfo = await getFileInfo(record.id);
      if (!fileInfo) {
        alert('Invoice file information not found');
        return;
      }

      // Get file as blob
      const fileBlob = await getFileAsBlob(record.id);
      if (!fileBlob) {
        alert('Unable to retrieve invoice file');
        return;
      }

      // Create download link
      const url = URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = url;
      
      // Create a clean filename
      const cleanInvoiceNumber = record.invoiceNumber.replace(/[/\\:*?"<>|]/g, '_');
      const cleanShipperName = record.shipperName.replace(/[/\\:*?"<>|]/g, '_').substring(0, 20);
      const fileExtension = fileInfo.name.split('.').pop() || 'xlsx';
      
      link.download = `Invoice_${cleanInvoiceNumber}_${cleanShipperName}.${fileExtension}`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      console.log(`Downloaded: ${link.download}`);
      
      } catch (error) {
      console.error('Error downloading invoice:', error);
      alert('Error downloading invoice file. Please try again.');
      }
    };
    
    downloadFile();
  };

  const clearAllFilters = () => {
    setFilters({});
    setSearchTerm('');
    setDateRange({ start: '', end: '' });
    setActiveSection('all');
    onFilterChange?.({});
  };

  const handleSectionChange = (section: 'all' | 'pending' | 'received' | 'hardcopyMissing') => {
    setActiveSection(section);
    // Clear specific filters when changing sections
    const newFilters = { ...filters };
    delete newFilters.pqStatus;
    delete newFilters.pqHardcopy;
    setFilters(newFilters);
  };

  const getRecordBackgroundColor = (record: PQRecord) => {
    const shippingBill = record.shippingBillReceived;
    const pqStatus = record.pqStatus;
    const permitStatus = record.permitCopyStatus;

    // PRIORITY 1: If PQ Status is "Pending", always show RED background
    if (pqStatus === 'Pending') {
      return 'bg-gradient-to-br from-red-50 via-rose-50 to-red-100 border-red-300 shadow-red-200/50';
    }

    // PRIORITY 2: Complete records (all requirements met) - GREEN
    if (shippingBill === true && 
        pqStatus === 'Received' && 
        (permitStatus === 'Received' || permitStatus === 'Not Required')) {
      return 'bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 border-green-300 shadow-green-200/50';
    }

    // PRIORITY 3: Other incomplete scenarios - RED
    if (shippingBill === false ||
        (shippingBill === true && pqStatus === 'Received' && permitStatus === 'Not Received')) {
      return 'bg-gradient-to-br from-red-50 via-rose-50 to-red-100 border-red-300 shadow-red-200/50';
    }

    // FALLBACK: Default blue for any other cases
    return 'bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 border-blue-300 shadow-blue-200/50';
  };

  const getShippingBillBadge = (status: string) => {
    if (status === true || status === 'Yes') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
          Bill ✓
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg">
          Bill ✗
        </span>
      );
    }
  };

  const getPQStatusBadge = (status: string, createdAt: number) => {
    const isDelayedStatus = isDelayed(createdAt, status);
    
    if (status === 'Received') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
          PQ ✓
        </span>
      );
    } else if (status === 'Pending') {
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          isDelayedStatus 
            ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg' 
            : 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg'
        }`}>
          PQ Pending {isDelayedStatus && `(${getHoursElapsed(createdAt)}h)`}
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-gray-500 to-slate-600 text-white shadow-lg">
          PQ: {status}
        </span>
      );
    }
  };

  const getPQHardcopyBadge = (status: string) => {
    if (status === 'Received') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
          Hard ✓
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg">
          Hard ✗
        </span>
      );
    }
  };

  const getPermitCopyBadge = (status: string) => {
    if (status === 'Received') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
          Permit ✓
        </span>
      );
    } else if (status === 'Not Required') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
          Permit N/A
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg">
          Permit ✗
        </span>
      );
    }
  };

  const getRecordStatusIndicator = (record: PQRecord) => {
    const shippingBill = record.shippingBillReceived;
    const pqStatus = record.pqStatus;
    const permitStatus = record.permitCopyStatus;

    if (shippingBill === true && 
        pqStatus === 'Received' && 
        (permitStatus === 'Received' || permitStatus === 'Not Required')) {
      return (
        <div className="flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full shadow-lg">
          <CheckCircle size={14} />
          <span className="text-xs font-semibold">Complete</span>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full shadow-lg">
        <Clock size={14} />
        <span className="text-xs font-semibold">Pending</span>
      </div>
    );
  };

  const isRecordCompleted = (record: PQRecord) => {
    const shippingBill = record.shippingBillReceived;
    const pqStatus = record.pqStatus;
    const permitStatus = record.permitCopyStatus;

    return shippingBill === true && 
           pqStatus === 'Received' && 
           (permitStatus === 'Received' || permitStatus === 'Not Required');
  };

  // Calculate counts using the same logic as dashboard
  const pendingCount = records.filter(record => {
    const shippingBill = record.shippingBillReceived;
    const pqStatus = record.pqStatus;
    const permitStatus = record.permitCopyStatus;
    
    // Complete scenario: Shipping Bill = Yes, PQ Status = Received, Permit = Received OR Not Required
    const isComplete = shippingBill === true && 
                      pqStatus === 'Received' && 
                      (permitStatus === 'Received' || permitStatus === 'Not Required');
    
    return !isComplete; // Count incomplete records as pending
  }).length;

  const receivedCount = records.filter(record => {
    const shippingBill = record.shippingBillReceived;
    const pqStatus = record.pqStatus;
    const permitStatus = record.permitCopyStatus;
    
    return shippingBill === true && 
           pqStatus === 'Received' && 
           (permitStatus === 'Received' || permitStatus === 'Not Required');
  }).length;

  const hardcopyMissingCount = records.filter(record => {
    return (record.pqHardcopy || 'Not Received') === 'Not Received';
  }).length;

  const currentSectionCount = filteredAndSortedRecords.length;

  const getSectionButtonStyle = (section: 'all' | 'pending' | 'received' | 'hardcopyMissing') => {
    const isActive = activeSection === section;
    const baseStyle = "relative overflow-hidden px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 flex items-center space-x-3";
    
    if (section === 'pending') {
      return `${baseStyle} ${isActive 
        ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-2xl shadow-red-500/25' 
        : 'bg-red-50 text-red-700 hover:bg-red-100 border-2 border-red-200'}`;
    } else if (section === 'received') {
      return `${baseStyle} ${isActive 
        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-2xl shadow-green-500/25' 
        : 'bg-green-50 text-green-700 hover:bg-green-100 border-2 border-green-200'}`;
    } else if (section === 'hardcopyMissing') {
      return `${baseStyle} ${isActive 
        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-2xl shadow-orange-500/25' 
        : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-2 border-orange-200'}`;
    } else {
      return `${baseStyle} ${isActive 
        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-2xl shadow-blue-500/25' 
        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-2 border-gray-200'}`;
    }
  };

  const getViewModeButtonStyle = (mode: 'details' | 'list') => {
    const isActive = viewMode === mode;
    const baseStyle = "relative overflow-hidden px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 flex items-center space-x-3";
    
    return `${baseStyle} ${isActive 
      ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-2xl shadow-purple-500/25' 
      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-2 border-purple-200'}`;
  };

  // Compact status indicator for list view
  const getCompactStatusIndicator = (record: PQRecord) => {
    const shippingBill = record.shippingBillReceived;
    const pqStatus = record.pqStatus;
    const permitStatus = record.permitCopyStatus;

    if (shippingBill === true && 
        pqStatus === 'Received' && 
        (permitStatus === 'Received' || permitStatus === 'Not Required')) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <Clock className="w-5 h-5 text-red-500" />;
  };

  const renderListView = () => (
    <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
      {/* Table Header */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-4 border-b border-gray-200">
        <div className="grid grid-cols-11 gap-4 text-sm font-semibold text-gray-700">
          <div className="col-span-1 flex items-center justify-center">Status</div>
          <div className="col-span-1">Date</div>
          <div className="col-span-2">Invoice #</div>
          <div className="col-span-2">Shipper</div>
          <div className="col-span-2">Buyer</div>
          <div className="col-span-1">Country</div>
          <div className="col-span-1">PQ Status</div>
          <div className="col-span-1">Actions</div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-gray-200">
        {filteredAndSortedRecords.map((record, index) => (
          <div
            key={record.id}
            className={`px-8 py-4 hover:bg-gray-50 transition-all duration-300 ${
              index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
            }`}
          >
            <div className="grid grid-cols-11 gap-4 items-center text-sm">
              {/* Status Indicator */}
              <div className="col-span-1 flex justify-center">
                {getCompactStatusIndicator(record)}
              </div>

              {/* Date */}
              <div className="col-span-1 font-medium text-gray-900">
                {record.date}
              </div>

              {/* Invoice Number */}
              <div className="col-span-2">
                <div className="font-semibold text-gray-900 truncate" title={record.invoiceNumber}>
                  {record.invoiceNumber}
                </div>
                {record.uploadedInvoice && (
                  <button
                    onClick={() => handleDownloadInvoice(record)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1 mt-1"
                    title="Download Invoice"
                  >
                    <FileDown size={12} />
                    <span>Download</span>
                  </button>
                )}
              </div>

              {/* Shipper */}
              <div className="col-span-2 text-gray-700 truncate" title={record.shipperName}>
                {record.shipperName}
              </div>

              {/* Buyer */}
              <div className="col-span-2 text-gray-700 truncate" title={record.buyer}>
                {record.buyer}
              </div>

              {/* Country */}
              <div className="col-span-1 text-gray-700 truncate" title={record.destinationPort}>
                {record.destinationPort}
              </div>

              {/* PQ Status */}
              <div className="col-span-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  record.pqStatus === 'Received' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {record.pqStatus}
                </span>
              </div>

              {/* Actions */}
              <div className="col-span-1 flex items-center space-x-2">
                <button
                  onClick={() => onEdit(record)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                  title="Edit record"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDelete(record.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                  title="Delete record"
                >
                  <Trash2 size={16} />
                </button>
                {!isRecordCompleted(record) && (
                  <button
                    onClick={() => handleMarkCompleted(record)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors duration-200"
                    title="Mark as completed"
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderDetailsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredAndSortedRecords.length > 0 ? (
        filteredAndSortedRecords.map((record, index) => (
          <div
            key={record.id}
            className={`group relative overflow-hidden border-2 rounded-2xl p-5 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 ${getRecordBackgroundColor(record)}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            
            {/* Content */}
            <div className="relative z-10 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2" title={record.invoiceNumber}>
                    {record.invoiceNumber}
                  </h3>
                  <p className="text-sm text-gray-600 font-medium">{record.date}</p>
                </div>
                {getRecordStatusIndicator(record)}
              </div>

              {/* Company Info */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Shipper</p>
                  <p className="text-sm font-semibold text-gray-800 line-clamp-2" title={record.shipperName}>
                    {record.shipperName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Buyer</p>
                  <p className="text-sm font-semibold text-gray-800 line-clamp-2" title={record.buyer}>
                    {record.buyer}
                  </p>
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {getShippingBillBadge(record.shippingBillReceived)}
                {getPQStatusBadge(record.pqStatus, record.createdAt)}
                {getPQHardcopyBadge(record.pqHardcopy || 'Not Received')}
                {getPermitCopyBadge(record.permitCopyStatus)}
              </div>

              {/* Commodity */}
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Commodity</p>
                <p className="text-sm text-gray-700 line-clamp-2" title={record.commodity}>
                  {record.commodity}
                </p>
              </div>

              {/* Destination */}
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Destination</p>
                <p className="text-sm font-semibold text-gray-800" title={record.destinationPort}>
                  {record.destinationPort}
                </p>
              </div>

              {/* Invoice File Section */}
              {record.uploadedInvoice && (
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-white/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">Invoice File</span>
                    </div>
                    <button
                      onClick={() => handleDownloadInvoice(record)}
                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors duration-200"
                      title="Download Invoice"
                    >
                      <FileDown size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Remarks */}
              {record.remarks && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Remarks</p>
                  <p className="text-sm text-gray-700 line-clamp-2" title={record.remarks}>
                    {record.remarks}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-white/40">
                <div className="flex space-x-2">
                  <button
                    onClick={() => onEdit(record)}
                    className="group relative overflow-hidden p-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg transform hover:scale-110 transition-all duration-300"
                    title="Edit record"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                    <Edit size={16} className="relative" />
                  </button>
                  
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="group relative overflow-hidden p-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl shadow-lg transform hover:scale-110 transition-all duration-300"
                    title="Delete record"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                    <Trash2 size={16} className="relative" />
                  </button>
                </div>
                
                {!isRecordCompleted(record) && (
                  <button
                    onClick={() => handleMarkCompleted(record)}
                    className="group relative overflow-hidden px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg transform hover:scale-105 transition-all duration-300"
                    title="Mark as completed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                    <div className="relative flex items-center space-x-1">
                      <Check size={14} />
                      <span className="text-xs font-semibold">Complete</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="col-span-full text-center py-20">
          <div className="w-24 h-24 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">No Records Found</h3>
          <p className="text-gray-500 mb-6">No PQ records match your current filters.</p>
          <button
            onClick={clearAllFilters}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-300"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-red-100 rounded-full">
          <Activity className="w-5 h-5 text-orange-600" />
          <span className="text-sm font-medium text-gray-700">Records Management</span>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
        </div>
        <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-orange-800 to-red-800 bg-clip-text text-transparent">
          PQ Certificate Records
        </h2>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Manage and track all your PQ certificate records with advanced filtering and export capabilities
        </p>
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => handleSectionChange('all')}
          className={getSectionButtonStyle('all')}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
            <div className="relative flex items-center space-x-2">
              <Activity size={18} />
              <span>All Records</span>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-bold">
                {records.length}
              </span>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleSectionChange('pending')}
          className={getSectionButtonStyle('pending')}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
            <div className="relative flex items-center space-x-2">
              <Clock size={18} />
              <span>Pending</span>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-bold">
                {pendingCount}
              </span>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleSectionChange('received')}
          className={getSectionButtonStyle('received')}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
            <div className="relative flex items-center space-x-2">
              <CheckCircle size={18} />
              <span>Completed</span>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-bold">
                {receivedCount}
              </span>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleSectionChange('hardcopyMissing')}
          className={getSectionButtonStyle('hardcopyMissing')}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
            <div className="relative flex items-center space-x-2">
              <Award size={18} />
              <span>Hardcopy Missing</span>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-bold">
                {hardcopyMissingCount}
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Controls Bar */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6">
        <div className="flex flex-col lg:flex-row items-center justify-between space-y-4 lg:space-y-0 lg:space-x-6">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/80 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300"
              />
            </div>

            {/* Shipper Filter */}
            <select
              value={filters.shipperName || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, shipperName: e.target.value || undefined }))}
              className="px-4 py-3 bg-white/80 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300"
            >
              <option value="">All Shippers</option>
              {uniqueShipperNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {/* Date Range */}
            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-2 bg-white/80 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-2 bg-white/80 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 text-sm"
              />
            </div>
          </div>

          {/* View Mode and Export */}
          <div className="flex items-center space-x-4">
            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('details')}
                className={getViewModeButtonStyle('details')}
              >
                <Grid size={18} />
                <span>Details</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={getViewModeButtonStyle('list')}
              >
                <List size={18} />
                <span>List</span>
              </button>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => exportToExcel(filteredAndSortedRecords, `pq_records_${activeSection}`)}
                className="group relative overflow-hidden px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-semibold shadow-2xl shadow-green-500/25 transform hover:scale-105 transition-all duration-300"
                title="Export to Excel"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                <div className="relative flex items-center space-x-2">
                  <FileSpreadsheet size={18} />
                  <span className="hidden sm:inline">Excel</span>
                </div>
              </button>
              
              <button
                onClick={() => exportToPDF(filteredAndSortedRecords, `pq_records_${activeSection}`)}
                className="group relative overflow-hidden px-4 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-2xl font-semibold shadow-2xl shadow-red-500/25 transform hover:scale-105 transition-all duration-300"
                title="Export to PDF"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                <div className="relative flex items-center space-x-2">
                  <Download size={18} />
                  <span className="hidden sm:inline">PDF</span>
                </div>
              </button>
            </div>

            {/* Clear Filters */}
            {(Object.keys(filters).length > 0 || searchTerm || dateRange.start || dateRange.end || activeSection !== 'all') && (
              <button
                onClick={clearAllFilters}
                className="group relative overflow-hidden px-4 py-3 bg-gradient-to-r from-gray-500 to-slate-600 text-white rounded-2xl font-semibold shadow-2xl shadow-gray-500/25 transform hover:scale-105 transition-all duration-300"
                title="Clear all filters"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                <div className="relative flex items-center space-x-2">
                  <X size={18} />
                  <span className="hidden sm:inline">Clear</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Results Summary */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Showing <span className="font-semibold text-gray-900">{currentSectionCount}</span> of{' '}
              <span className="font-semibold text-gray-900">{records.length}</span> records
            </span>
            <div className="flex items-center space-x-4">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as keyof PQRecord)}
                className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="createdAt">Sort by Created Date</option>
                <option value="date">Sort by Date</option>
                <option value="invoiceNumber">Sort by Invoice</option>
                <option value="shipperName">Sort by Shipper</option>
                <option value="pqStatus">Sort by PQ Status</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors duration-200"
              >
                {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Records Display */}
      {viewMode === 'details' ? renderDetailsView() : renderListView()}
    </div>
  );
};

export default RecordsView;