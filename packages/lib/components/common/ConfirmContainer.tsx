'use client';
import { AnimatePresence } from 'framer-motion';
import { ConfirmModal } from './ConfirmModal';
import { useConfirmStore } from '../../stores/useConfirmStore';

export default function ConfirmContainer() {
  const { confirmState, closeConfirm } = useConfirmStore();

  return (
    <AnimatePresence>
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          variant={confirmState.variant}
          isModal={confirmState.isModal}
          confirmText={confirmState.confirmText}
          cancelText={confirmState.cancelText}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
        />
      )}
    </AnimatePresence>
  );
}