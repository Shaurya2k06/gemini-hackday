import React, { useState } from 'react';

/**
 * Notched Product Card
 * Role: Floating product showcase with geometric corners
 * Dark card (~400px square) with notched/hexagonal corner cuts, #000000 background,
 * #ffffff micro-label ('SCROLL' at 9px Helvetica Now) in the lower-left.
 * Floats centered over classical painting imagery.
 */
export const NotchedProductCard = ({ onOpenMint }) => {
  const [activeTab, setActiveTab] = useState('yield');

  return (
    <div className="relative w-full max-w-[420px] mx-auto select-none">
      {/* Outer wrapper with corner notched clip path and hairline border */}
      <div
        className="relative bg-[#000000] text-[#ffffff] p-8 sm:p-9 shadow-2xl transition-transform duration-500 hover:scale-[1.01]"
        style={{
          clipPath:
            'polygon(16px 0%, calc(100% - 16px) 0%, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0% calc(100% - 16px), 0% 16px)',
          minHeight: '400px',
        }}
      >
        {/* Subtle hairline frame inside */}
        <div
          className="absolute inset-[1px] pointer-events-none"
          style={{
            clipPath:
              'polygon(15px 0%, calc(100% - 15px) 0%, 100% 15px, 100% calc(100% - 15px), calc(100% - 15px) 100%, 15px 100%, 0% calc(100% - 15px), 0% 15px)',
            border: '1px solid rgba(223, 220, 213, 0.15)',
          }}
        />

        {/* Top Header Row inside Card */}
        <div className="flex items-center justify-between pb-5 border-b border-[#dfdcd5]/20">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#ffffff] inline-block animate-pulse" />
            <span className="font-helvetica-now text-[11px] uppercase tracking-widest text-[#dfdcd5]">
              Vault Series IV
            </span>
          </div>
          <span className="font-helvetica-now text-[11px] text-[#808080] tracking-wider">
            EPOCH 01 / LIVE
          </span>
        </div>

        {/* Main Card Content */}
        <div className="pt-6 pb-8 space-y-6">
          <div>
            <span className="font-helvetica-now text-[11px] text-[#808080] uppercase tracking-wider block mb-1">
              Target Asset
            </span>
            <div className="flex items-baseline justify-between">
              <h3 className="font-davinci text-[34px] font-medium tracking-tight text-[#ffffff] leading-none">
                mxBTC
              </h3>
              <span className="font-helvetica-now text-[14px] text-[#dfdcd5] tracking-tight">
                1 mxBTC = 1.0000 BTC
              </span>
            </div>
          </div>

          {/* Telemetry Metrics */}
          <div className="grid grid-cols-2 gap-4 py-4 border-y border-[#dfdcd5]/20 font-helvetica-now">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#808080] block mb-0.5">
                Real Basis APY
              </span>
              <span className="font-davinci text-[26px] font-medium text-[#ffffff] tracking-tight">
                6.24%
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#808080] block mb-0.5">
                Locked Liquidity
              </span>
              <span className="font-davinci text-[26px] font-medium text-[#ffffff] tracking-tight">
                85.42 BTC
              </span>
            </div>
          </div>

          {/* Vault Security Specs */}
          <div className="space-y-1.5 text-[12px] font-helvetica-now text-[#dfdcd5]/90">
            <div className="flex justify-between">
              <span className="text-[#808080]">Collateral Model</span>
              <span className="text-[#ffffff]">100% BTC L1 Reserve</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#808080]">Strategy</span>
              <span className="text-[#ffffff]">Delta-Neutral Basis Arbitrage</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#808080]">Liquidation Risk</span>
              <span className="text-[#ffffff]">Zero (Mathematical Parity)</span>
            </div>
          </div>

          {/* Action Button inside card */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onOpenMint}
              style={{
                borderRadius: '28.8px',
                padding: '9px 17px',
                backgroundColor: '#ffffff',
                color: '#000000',
              }}
              className="w-full font-helvetica-now text-[12px] font-normal hover:bg-[#ebebeb] transition-colors cursor-pointer border-0 flex items-center justify-center gap-2"
            >
              mint mxBTC
            </button>
          </div>
        </div>

        {/* Lower Corner Micro-Labels as specified in brief */}
        <div className="flex items-center justify-between pt-2 border-t border-[#dfdcd5]/15">
          <span className="font-helvetica-now text-[9px] uppercase tracking-[0.25em] text-[#ffffff] font-normal">
            SCROLL
          </span>
          <span className="font-helvetica-now text-[9px] uppercase tracking-[0.2em] text-[#808080]">
            FOLIO REF 0492-B
          </span>
        </div>
      </div>
    </div>
  );
};

export default NotchedProductCard;
