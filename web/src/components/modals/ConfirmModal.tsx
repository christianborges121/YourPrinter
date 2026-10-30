import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../common/Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Keep Printing',
  isDanger = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 text-[#EF4444]">
          <AlertTriangle size={18} />
          {title}
        </span>
      }
      maxWidth="max-w-sm"
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs sm:text-sm text-[#D1D5DB] leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[#D1D5DB] bg-[#262626] hover:bg-[#383838] border border-[#2E2E2E] transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${
              isDanger
                ? 'bg-[#EF4444] hover:bg-[#DC2626]'
                : 'bg-[#00AE42] hover:bg-[#009638]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};
