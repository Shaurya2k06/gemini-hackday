import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const PointsModal = ({ isOpen, onClose, onOpenMint }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg bg-[#e7e5e4] text-[#000000] rounded-[9px] border border-[#dfdcd5] p-8 z-10 font-helvetica-now"
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-6 border-b border-[#dfdcd5]">
              <div>
                <span className="text-[11px] uppercase tracking-widest text-[#595855] block mb-1 font-medium">
                  Folio IV — Incentive Allocation
                </span>
                <h3 className="font-davinci text-[26px] font-medium text-[#000000] leading-none tracking-tight">
                  Structured Points
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-[13px] text-[#595855] hover:text-[#000000] cursor-pointer bg-transparent border-0 underline-offset-4 hover:underline"
              >
                Close [esc]
              </button>
            </div>

            {/* Content Body */}
            <div className="pt-6 space-y-6">
              <p className="text-[14px] text-[#595855] leading-relaxed">
                Structured Points track community provenance and early liquidity participation across epochs. Points accrue continuously per block based on held mxBTC and collateral lock tenure.
              </p>

              {/* Epoch stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#ffffff] border border-[#dfdcd5] rounded-[9px] p-4">
                  <span className="text-[10px] uppercase tracking-wider text-[#595855] block mb-1">
                    Epoch 01 Multiplier
                  </span>
                  <span className="font-davinci text-[22px] font-medium text-[#000000]">
                    2.50× Weight
                  </span>
                </div>
                <div className="bg-[#ffffff] border border-[#dfdcd5] rounded-[9px] p-4">
                  <span className="text-[10px] uppercase tracking-wider text-[#595855] block mb-1">
                    Global Minted TVL
                  </span>
                  <span className="font-davinci text-[22px] font-medium text-[#000000]">
                    85.42 BTC
                  </span>
                </div>
              </div>

              {/* Rules / Folio items */}
              <div className="space-y-3 pt-2 text-[13px] border-t border-[#dfdcd5]">
                <div className="flex items-start justify-between py-1 border-b border-[#dfdcd5]/60">
                  <span className="text-[#595855]">Hold mxBTC in Cold Vault</span>
                  <span className="text-[#000000] font-medium">10,000 pts / BTC / day</span>
                </div>
                <div className="flex items-start justify-between py-1 border-b border-[#dfdcd5]/60">
                  <span className="text-[#595855]">Delta-Neutral Basis Collateral</span>
                  <span className="text-[#000000] font-medium">25,000 pts / BTC / day</span>
                </div>
                <div className="flex items-start justify-between py-1">
                  <span className="text-[#595855]">Referral Provenance</span>
                  <span className="text-[#000000] font-medium">+15% direct allocation</span>
                </div>
              </div>

              {/* Action */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    onClose();
                    if (onOpenMint) onOpenMint();
                  }}
                  style={{ borderRadius: '28.8px', padding: '11px 20px' }}
                  className="w-full bg-[#000000] text-[#ffffff] text-[12px] font-normal hover:bg-[#1f1e1c] transition-all cursor-pointer border-0"
                >
                  Start Accruing — Mint mxBTC
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PointsModal;
