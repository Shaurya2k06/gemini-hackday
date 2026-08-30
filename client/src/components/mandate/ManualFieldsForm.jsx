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
    <label className="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#8f8b80] mb-1">
      {children}
    </label>
  );
}

function TextInput({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-2.5 py-1.5 text-[14px] border border-hairline bg-cream text-ink outline-none focus:border-ink/40 disabled:opacity-50 ${className}`}
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
    <div className="border border-hairline bg-[#fbf7ec] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-secondary">Enter screening fields</p>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="p-1 hover:bg-ink/5 border-none bg-transparent cursor-pointer text-secondary disabled:opacity-40"
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
                className={`px-2.5 py-1 rounded-full text-[12px] border cursor-pointer transition-colors disabled:opacity-40 ${
                  active
                    ? 'bg-ink text-cream border-ink'
                    : 'bg-transparent text-secondary border-hairline hover:border-ink/40 hover:text-ink'
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
            <span className="text-[13px] text-secondary">–</span>
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
            <span className="text-[13px] text-secondary">–</span>
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
          className="h-[32px] px-3 font-mono text-[11px] uppercase tracking-[0.06em] border border-ink/20 bg-transparent text-secondary hover:text-ink hover:border-ink transition-colors cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className="h-[32px] px-4 font-mono text-[11px] uppercase tracking-[0.06em] bg-accent-red text-white border-none cursor-pointer hover:brightness-105 transition-all disabled:opacity-40"
        >
          Apply fields
        </button>
      </div>
    </div>
  );
}
