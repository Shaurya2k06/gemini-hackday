import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const MintModal = ({ isOpen, onClose }) => {
  const [btcAmount, setBtcAmount] = useState('1.00');
  const [isMinting, setIsMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState(false);

  const numBtc = parseFloat(btcAmount) || 0;
  const apyRate = 0.0624; // 6.24% APY
  const annualYieldBtc = (numBtc * apyRate).toFixed(4);
  const monthlyYieldBtc = (annualYieldBtc / 12).toFixed(4);
  const earnedPoints = Math.floor(numBtc * 10000);

  const handleMint = () => {
    setIsMinting(true);
    setTimeout(() => {
      setIsMinting(false);
      setMintSuccess(true);
      setTimeout(() => {
        setMintSuccess(false);
        onClose();
      }, 2200);
    }, 1200);
  };

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
            className="fixed inset-0 bg-black/60 backdrop-blur-none"
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
                  Vault Execution — Series IV
                </span>
                <h3 className="font-davinci text-[26px] font-medium text-[#000000] leading-none tracking-tight">
                  Mint mxBTC
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
            {mintSuccess ? (
              <div className="py-12 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border border-[#000000] mx-auto flex items-center justify-center font-davinci text-xl">
                  ✓
                </div>
                <h4 className="font-davinci text-[24px] text-[#000000] font-medium">
                  Allocation Confirmed
                </h4>
                <p className="text-[14px] text-[#595855] max-w-xs mx-auto leading-relaxed">
                  {btcAmount} mxBTC has been successfully allocated to your cryptographic ledger. Continuous compounding has commenced.
                </p>
              </div>
            ) : (
              <div className="pt-6 space-y-6">
                <div>
                  <div className="flex justify-between text-[13px] text-[#595855] mb-2 font-medium">
                    <span>Deposit Sovereign BTC</span>
                    <span>Balance: 4.8500 BTC</span>
                  </div>
                  <div className="relative bg-[#ffffff] border border-[#dfdcd5] rounded-[9px] p-3.5 flex items-center justify-between">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={btcAmount}
                      onChange={(e) => setBtcAmount(e.target.value)}
                      className="w-full bg-transparent border-none outline-none font-helvetica-now text-[20px] font-medium text-[#000000]"
                      placeholder="0.00"
                    />
                    <span className="text-[13px] font-semibold tracking-wider text-[#000000] pl-2 border-l border-[#dfdcd5]">
                      BTC
                    </span>
                  </div>
                </div>

                {/* Ledger Breakdown */}
                <div className="space-y-2.5 py-4 border-y border-[#dfdcd5] text-[13px]">
                  <div className="flex justify-between text-[#595855]">
                    <span>Minted mxBTC (1:1 Proof of Reserve)</span>
                    <span className="text-[#000000] font-medium">{btcAmount || '0.00'} mxBTC</span>
                  </div>
                  <div className="flex justify-between text-[#595855]">
                    <span>Current Basis APY</span>
                    <span className="text-[#000000] font-medium">6.24% variable</span>
                  </div>
                  <div className="flex justify-between text-[#595855]">
                    <span>Est. Annual Accrual</span>
                    <span className="text-[#000000] font-medium">+{annualYieldBtc} BTC / yr</span>
                  </div>
                  <div className="flex justify-between text-[#595855]">
                    <span>Structured Points Multiplier</span>
                    <span className="text-[#000000] font-medium">2.5× Epoch 1 (+{earnedPoints} pts)</span>
                  </div>
                  <div className="flex justify-between text-[#595855]">
                    <span>Protocol Mint Fee</span>
                    <span className="text-[#000000] font-medium">0.00% (Gasless)</span>
                  </div>
                </div>

                {/* Action button */}
                <div className="pt-2">
                  <button
                    disabled={isMinting || numBtc <= 0}
                    onClick={handleMint}
                    style={{ borderRadius: '28.8px', padding: '12px 24px' }}
                    className="w-full bg-[#000000] text-[#ffffff] text-[13px] font-normal hover:bg-[#1f1e1c] disabled:opacity-50 transition-all cursor-pointer border-0 flex items-center justify-center gap-2"
                  >
                    {isMinting ? 'Verifying Proof of Reserve...' : `Mint ${btcAmount || '0.00'} mxBTC`}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default MintModal;
