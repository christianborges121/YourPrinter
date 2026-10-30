import React, { useState } from 'react';
import { PlusCircle, Printer, AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { usePrinter } from '../../context/PrinterContext';

interface AddPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddPrinterModal: React.FC<AddPrinterModalProps> = ({ isOpen, onClose }) => {
  const { addPrinter } = usePrinter();

  const [name, setName] = useState<string>('');
  const [ipAddress, setIpAddress] = useState<string>('');
  const [printerModel, setPrinterModel] = useState<string>('FlashForge Creator 5');
  const [serialNumber, setSerialNumber] = useState<string>('');
  const [checkCode, setCheckCode] = useState<string>('');
  const [connectNow, setConnectNow] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ipAddress.trim()) {
      setErrorMessage('Printer name and IP address are required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await addPrinter({
        name: name.trim(),
        ipAddress: ipAddress.trim(),
        printerModel,
        serialNumber: serialNumber.trim() || undefined,
        checkCode: checkCode.trim() || undefined,
        connectNow,
      });

      if (res.success) {
        onClose();
      } else {
        setErrorMessage(res.error || res.connectionError || 'Failed to add printer.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const models = [
    'FlashForge Creator 5',
    'FlashForge Adventurer 5M',
    'FlashForge Adventurer 5M Pro',
    'FlashForge Creator 4',
    'Bambu Lab A1 Mini',
    'Bambu Lab A1',
    'Bambu Lab P1S',
    'Bambu Lab X1-Carbon',
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <PlusCircle size={18} className="text-[#00AE42]" />
          <span>Add 3D Printer to Fleet</span>
        </span>
      }
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errorMessage && (
          <div className="p-3 bg-[#EF4444]/15 border border-[#EF4444]/30 rounded-xl flex items-start gap-2 text-xs text-[#EF4444]">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#D1D5DB]">Printer Display Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Workshop Creator 5"
            className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg px-3 py-2 text-xs text-[#F3F4F6] outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#D1D5DB]">IP Address or Hostname *</label>
          <input
            type="text"
            required
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="e.g. 192.168.1.100"
            className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg px-3 py-2 text-xs font-mono text-[#F3F4F6] outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#D1D5DB]">Printer Model Family</label>
          <select
            value={printerModel}
            onChange={(e) => setPrinterModel(e.target.value)}
            className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg px-3 py-2 text-xs text-[#F3F4F6] outline-none cursor-pointer"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#D1D5DB]">Serial Number (Optional)</label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. SN12345678"
              className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg px-3 py-2 text-xs font-mono text-[#F3F4F6] outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#D1D5DB]">Check Code (Bambu/Flash)</label>
            <input
              type="password"
              value={checkCode}
              onChange={(e) => setCheckCode(e.target.value)}
              placeholder="Security code"
              className="w-full bg-[#262626] border border-[#2E2E2E] focus:border-[#00AE42] rounded-lg px-3 py-2 text-xs font-mono text-[#F3F4F6] outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#D1D5DB] pt-1">
          <input
            type="checkbox"
            checked={connectNow}
            onChange={(e) => setConnectNow(e.target.checked)}
            className="rounded border-[#2E2E2E] text-[#00AE42] focus:ring-0"
          />
          <span>Connect immediately upon adding</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#2E2E2E]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#262626] hover:bg-[#383838] text-xs font-semibold text-[#D1D5DB] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00AE42] hover:bg-[#009638] text-xs font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          >
            <Printer size={14} className={isSubmitting ? 'animate-spin' : ''} />
            <span>{isSubmitting ? 'Registering...' : 'Add Printer'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
