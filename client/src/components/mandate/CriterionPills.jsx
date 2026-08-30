import React, { useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

const ADDABLE_ROWS = [
  { category: 'Geography', field: 'geography', placeholder: 'Add a city or region…' },
  { category: 'Sector', field: 'sector_tags', placeholder: 'Add a sector…' },
  { category: 'Funding stage', field: 'funding_stage', placeholder: 'Add a stage…' },
  { category: 'Keywords', field: 'keywords', placeholder: 'Add a keyword…' },
];

const OTHER_CATEGORIES = ['Founded', 'Company'];

function groupPills(pills) {
  const grouped = new Map();
  for (const pill of pills) {
    if (pill.field === 'revenue' || pill.field === 'ebitda' || pill.field === 'employees') {
      continue;
    }
    const list = grouped.get(pill.category) ?? [];
    list.push(pill);
    grouped.set(pill.category, list);
  }
  return grouped;
}

function PillChip({ pill, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs bg-white dark:bg-[#161616] border border-[#dfdcd5] dark:border-[#333] text-black dark:text-white">
      <span className="font-medium">{pill.label}</span>
      {pill.removable !== false && onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(pill)}
          className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 border-none bg-transparent cursor-pointer text-[#595855] dark:text-[#808080]"
          aria-label={`Remove ${pill.label}`}
        >
          <X size={12} />
        </button>
      ) : null}
    </span>
  );
}

function CategoryRow({
  category,
  pills,
  field,
  placeholder,
  addingField,
  fieldInput,
  onRemove,
  onStartAdd,
  onFieldInputChange,
  onCommitFieldAdd,
  onCancelAdd,
  disabled,
}) {
  const inputRef = useRef(null);
  const isAdding = addingField === field;

  useEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  return (
    <div className="flex flex-wrap items-center gap-2 min-h-[28px]">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[#595855] dark:text-[#808080] w-24 shrink-0">
        {category}
      </span>
      {pills.map((pill) => (
        <PillChip key={pill.id} pill={pill} onRemove={onRemove} />
      ))}
      {isAdding ? (
        <input
          ref={inputRef}
          type="text"
          value={fieldInput}
          onChange={(e) => onFieldInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommitFieldAdd();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancelAdd();
            }
          }}
          onBlur={() => {
            if (fieldInput.trim()) onCommitFieldAdd();
            else onCancelAdd();
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="min-w-[140px] max-w-[220px] px-2.5 py-1 rounded-full text-xs border border-[#dfdcd5] dark:border-[#444] bg-white dark:bg-[#161616] outline-none focus:border-black/40 dark:focus:border-white/40"
        />
      ) : (
        <button
          type="button"
          onClick={() => onStartAdd(field)}
          disabled={disabled}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-[#dfdcd5] dark:border-[#444] text-[#595855] dark:text-[#a0a0a0] hover:border-black/30 dark:hover:border-white/30 bg-transparent cursor-pointer disabled:opacity-40"
          aria-label={`Add ${category.toLowerCase()}`}
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}

function usdToMillionsInput(n) {
  if (n == null || !Number.isFinite(n)) return '';
  return String(n / 1_000_000);
}

function millionsInputToUsd(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n * 1_000_000;
}

function intInput(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/**
 * Editable min–max range for revenue / EBITDA ($M) or employees (count).
 */
function RangeRow({
  category,
  min,
  max,
  unit = 'millions',
  onChange,
  onClear,
  disabled = false,
}) {
  const show = min != null || max != null;
  if (!show) return null;

  const minVal = unit === 'millions' ? usdToMillionsInput(min) : min == null ? '' : String(min);
  const maxVal = unit === 'millions' ? usdToMillionsInput(max) : max == null ? '' : String(max);
  const suffix = unit === 'millions' ? '$M' : '';

  const commit = (nextMinRaw, nextMaxRaw) => {
    const nextMin = unit === 'millions' ? millionsInputToUsd(nextMinRaw) : intInput(nextMinRaw);
    const nextMax = unit === 'millions' ? millionsInputToUsd(nextMaxRaw) : intInput(nextMaxRaw);
    onChange?.({ min: nextMin, max: nextMax });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 min-h-[28px]">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[#595855] dark:text-[#808080] w-24 shrink-0">
        {category}
      </span>
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-white dark:bg-[#161616] border border-[#dfdcd5] dark:border-[#333]">
        <input
          type="number"
          inputMode="decimal"
          value={minVal}
          disabled={disabled}
          onChange={(e) => commit(e.target.value, maxVal)}
          placeholder="Min"
          className="w-14 bg-transparent border-none outline-none text-xs text-center tabular-nums disabled:opacity-50"
          aria-label={`${category} minimum`}
        />
        <span className="text-[#595855] dark:text-[#808080]">–</span>
        <input
          type="number"
          inputMode="decimal"
          value={maxVal}
          disabled={disabled}
          onChange={(e) => commit(minVal, e.target.value)}
          placeholder="Max"
          className="w-14 bg-transparent border-none outline-none text-xs text-center tabular-nums disabled:opacity-50"
          aria-label={`${category} maximum`}
        />
        {suffix ? <span className="text-[#595855] dark:text-[#808080] pr-0.5">{suffix}</span> : null}
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 border-none bg-transparent cursor-pointer text-[#595855] dark:text-[#808080] disabled:opacity-40"
            aria-label={`Clear ${category}`}
          >
            <X size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CriterionPills({
  pills = [],
  structured = null,
  onRemove,
  onRangeChange,
  addingField = null,
  fieldInput = '',
  onStartAdd,
  onFieldInputChange,
  onCommitFieldAdd,
  onCancelAdd,
  disabled = false,
}) {
  if (!pills.length && !addingField && !structured) return null;

  const grouped = groupPills(pills);

  const addableRows = ADDABLE_ROWS.filter(
    (row) => (grouped.get(row.category)?.length ?? 0) > 0 || addingField === row.field
  );

  const otherRows = OTHER_CATEGORIES.filter((category) => grouped.has(category));

  const hasRanges =
    structured &&
    (structured.revenue_min != null ||
      structured.revenue_max != null ||
      structured.ebitda_min != null ||
      structured.ebitda_max != null ||
      structured.employees_min != null ||
      structured.employees_max != null);

  if (!addableRows.length && !otherRows.length && !hasRanges && !addingField) return null;

  return (
    <div className="space-y-2.5">
      {addableRows.map((row) => (
        <CategoryRow
          key={row.field}
          category={row.category}
          field={row.field}
          placeholder={row.placeholder}
          pills={grouped.get(row.category) ?? []}
          addingField={addingField}
          fieldInput={fieldInput}
          onRemove={onRemove}
          onStartAdd={onStartAdd}
          onFieldInputChange={onFieldInputChange}
          onCommitFieldAdd={onCommitFieldAdd}
          onCancelAdd={onCancelAdd}
          disabled={disabled}
        />
      ))}

      <RangeRow
        category="Revenue"
        min={structured?.revenue_min}
        max={structured?.revenue_max}
        unit="millions"
        disabled={disabled}
        onChange={({ min, max }) => onRangeChange?.('revenue', { min, max })}
        onClear={() => onRangeChange?.('revenue', { min: null, max: null })}
      />
      <RangeRow
        category="EBITDA"
        min={structured?.ebitda_min}
        max={structured?.ebitda_max}
        unit="millions"
        disabled={disabled}
        onChange={({ min, max }) => onRangeChange?.('ebitda', { min, max })}
        onClear={() => onRangeChange?.('ebitda', { min: null, max: null })}
      />
      <RangeRow
        category="Employees"
        min={structured?.employees_min}
        max={structured?.employees_max}
        unit="count"
        disabled={disabled}
        onChange={({ min, max }) => onRangeChange?.('employees', { min, max })}
        onClear={() => onRangeChange?.('employees', { min: null, max: null })}
      />

      {otherRows.map((category) => (
        <div key={category} className="flex flex-wrap items-center gap-2 min-h-[28px]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[#595855] dark:text-[#808080] w-24 shrink-0">
            {category}
          </span>
          {(grouped.get(category) ?? []).map((pill) => (
            <PillChip key={pill.id} pill={pill} onRemove={onRemove} />
          ))}
        </div>
      ))}
    </div>
  );
}
