import React, { useState } from 'react';
import { X } from 'lucide-react';

const STAGE_OPTIONS = [
  { id: 'pre-seed', label: 'Pre-seed' },
  { id: 'seed', label: 'Seed' },
  { id: 'series_a', label: 'Series A' },
  { id: 'series_b', label: 'Series B' },
  { id: 'series_c_plus', label: 'Series C+' },
];

const EMPTY_FORM = {
  geography: '',
  sector: '',
  stages: [],
  revenueMin: '',
  revenueMax: '',
  employeesMin: '',
  employeesMax: '',
  keywords: '',
};

function parseList(raw) {
  return String(raw ?? '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatUsdM(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return `$${n}M`;
}

/**
 * Build a natural-language mandate fragment from the manual form values.
 */
export function buildManualMandateText(form) {
  const parts = [];
  const sector = form.sector.trim();
  const geos = parseList(form.geography);
  const keywords = parseList(form.keywords);
  const stages = STAGE_OPTIONS.filter((s) => form.stages.includes(s.id)).map((s) => s.label);

  if (sector) parts.push(sector);
  if (geos.length) parts.push(`in ${geos.join(' and ')}`);
  if (stages.length) parts.push(stages.join(' or '));

  const revMin = formatUsdM(form.revenueMin);
  const revMax = formatUsdM(form.revenueMax);
  if (revMin && revMax) parts.push(`${revMin}–${revMax} revenue`);
  else if (revMin) parts.push(`${revMin}+ revenue`);
  else if (revMax) parts.push(`up to ${revMax} revenue`);

  const empMin = String(form.employeesMin ?? '').trim();
  const empMax = String(form.employeesMax ?? '').trim();
  if (empMin && empMax) parts.push(`${empMin}–${empMax} employees`);
  else if (empMin) parts.push(`${empMin}+ employees`);
  else if (empMax) parts.push(`up to ${empMax} employees`);

  if (keywords.length) parts.push(keywords.join(', '));

  return parts.join(', ').trim();
}

function FieldLabel({ children }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wide text-[#595855] dark:text-[#808080] mb-1">
      {children}
    </label>
  );
}

function TextInput({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-2.5 py-1.5 rounded-lg text-sm border border-[#dfdcd5] dark:border-[#333] bg-white dark:bg-[#0a0a0a] text-black dark:text-white outline-none focus:border-black/40 dark:focus:border-white/40 disabled:opacity-50 ${className}`}
    />
  );
}

export function ManualFieldsForm({ onApply, onCancel, disabled = false }) {
  const [form, setForm] = useState(EMPTY_FORM);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleStage = (id) => {
    setForm((prev) => ({
      ...prev,
      stages: prev.stages.includes(id)
        ? prev.stages.filter((s) => s !== id)
        : [...prev.stages, id],
    }));
  };

  const text = buildManualMandateText(form);
  const canApply = Boolean(text) && !disabled;

  const handleApply = () => {
    if (!canApply) return;
    onApply?.(text);
  };

  return (
    <div className="rounded-xl border border-[#dfdcd5] dark:border-[#333] bg-white dark:bg-[#161616] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-black dark:text-white">Enter screening fields</p>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 border-none bg-transparent cursor-pointer text-[#595855] dark:text-[#808080] disabled:opacity-40"
          aria-label="Close manual fields form"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Geography</FieldLabel>
          <TextInput
            value={form.geography}
            onChange={(e) => set('geography', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Australia, Sydney"
          />
        </div>
        <div>
          <FieldLabel>Sector</FieldLabel>
          <TextInput
            value={form.sector}
            onChange={(e) => set('sector', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Healthcare"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Funding stage</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {STAGE_OPTIONS.map((stage) => {
            const active = form.stages.includes(stage.id);
            return (
              <button
                key={stage.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleStage(stage.id)}
                className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer transition-colors disabled:opacity-40 ${
                  active
                    ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                    : 'bg-transparent text-[#595855] dark:text-[#a0a0a0] border-[#dfdcd5] dark:border-[#444] hover:border-black/30 dark:hover:border-white/30'
                }`}
              >
                {stage.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Revenue ($M)</FieldLabel>
          <div className="flex items-center gap-1.5">
            <TextInput
              type="number"
              inputMode="decimal"
              value={form.revenueMin}
              onChange={(e) => set('revenueMin', e.target.value)}
              disabled={disabled}
              placeholder="Min"
            />
            <span className="text-xs text-[#595855] dark:text-[#808080]">–</span>
            <TextInput
              type="number"
              inputMode="decimal"
              value={form.revenueMax}
              onChange={(e) => set('revenueMax', e.target.value)}
              disabled={disabled}
              placeholder="Max"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Employees</FieldLabel>
          <div className="flex items-center gap-1.5">
            <TextInput
              type="number"
              inputMode="numeric"
              value={form.employeesMin}
              onChange={(e) => set('employeesMin', e.target.value)}
              disabled={disabled}
              placeholder="Min"
            />
            <span className="text-xs text-[#595855] dark:text-[#808080]">–</span>
            <TextInput
              type="number"
              inputMode="numeric"
              value={form.employeesMax}
              onChange={(e) => set('employeesMax', e.target.value)}
              disabled={disabled}
              placeholder="Max"
            />
          </div>
        </div>
      </div>

      <div>
        <FieldLabel>Keywords</FieldLabel>
        <TextInput
          value={form.keywords}
          onChange={(e) => set('keywords', e.target.value)}
          disabled={disabled}
          placeholder="e.g. telehealth, clinical AI"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="px-3 py-1.5 rounded-lg text-xs border border-[#dfdcd5] dark:border-[#333] bg-transparent text-[#595855] dark:text-[#a0a0a0] cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-black text-white dark:bg-white dark:text-black border-none cursor-pointer disabled:opacity-40"
        >
          Apply fields
        </button>
      </div>
    </div>
  );
}
