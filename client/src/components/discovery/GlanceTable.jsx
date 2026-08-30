import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, Plus, ChevronDown, X, Loader2 } from 'lucide-react';
import { formatDate, formatStage, formatUsdDisplay } from './format';

const OPTIONAL_COLUMNS = [
  { id: 'total_raised', label: 'Total raised', render: (co) => formatUsdDisplay(co.raised) },
  { id: 'last_funding_date', label: 'Last round', render: (co) => formatDate(co.lastFundingDate) },
  { id: 'annual_revenue_usd', label: 'Revenue', render: (co) => formatUsdDisplay(co.revenue) },
  { id: 'annual_ebitda_usd', label: 'EBITDA', render: (co) => formatUsdDisplay(co.ebitda) },
  { id: 'employees_count', label: 'Employees', render: (co) => co.employees ?? '—' },
  { id: 'founded_date', label: 'Founded', render: (co) => formatDate(co.foundedDate) },
  {
    id: 'investors',
    label: 'Investors',
    render: (co) => (co.investors?.length ? co.investors.slice(0, 3).join(', ') : '—'),
  },
  {
    id: 'sector_tags',
    label: 'Sectors',
    render: (co) => (co.sectors?.length ? co.sectors.join(', ') : '—'),
  },
  {
    id: 'fit_score',
    label: 'Fit score',
    render: (co) => (co.peFitScore != null ? co.peFitScore.toFixed(2) : '—'),
  },
  {
    id: 'investment_summary',
    label: 'Summary',
    render: (co) => {
      const s = co.investmentSummary ?? '';
      return s.length > 80 ? `${s.slice(0, 80)}…` : s || '—';
    },
  },
  {
    id: 'sources',
    label: 'Sources',
    render: (co) => String((co.enrichmentSources?.length ?? 0) + (co.sources?.length ?? 0)),
  },
];

function customCellValue(col, domain) {
  if (col.loading) return '…';
  const value = col.values?.[domain];
  if (value == null || value === '') return '—';
  return value;
}

export function GlanceTable({
  companies,
  onRowClick,
  customColumns = [],
  onAddCustomColumn,
  onRemoveCustomColumn,
  customColumnBusy = false,
}) {
  const [extraCols, setExtraCols] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!companies.length) {
    return (
      <p className="text-sm text-[#595855] dark:text-[#808080] py-8 text-center">
        No companies in this shortlist.
      </p>
    );
  }

  const activeOptional = OPTIONAL_COLUMNS.filter((c) => extraCols.includes(c.id));

  const toggleCol = (id) => {
    setExtraCols((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddCustom = async () => {
    const q = customQuery.trim();
    if (!q || !onAddCustomColumn || customColumnBusy) return;
    await onAddCustomColumn(q);
    setCustomQuery('');
  };

  const headerLabels = [
    '#',
    'Company',
    'Stage',
    'HQ',
    'Email',
    'Phone',
    ...activeOptional.map((c) => c.label),
    ...customColumns.map((c) => c.label),
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[#dfdcd5] dark:border-[#333] bg-white dark:bg-[#111] cursor-pointer hover:border-black/20 dark:hover:border-white/20"
        >
          <Plus size={12} />
          Column
          <ChevronDown size={12} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full mt-1 z-20 w-[260px] rounded-lg border border-[#dfdcd5] dark:border-[#333] bg-white dark:bg-[#161616] shadow-lg py-1 max-h-80 overflow-y-auto">
            {OPTIONAL_COLUMNS.map((col) => (
              <label
                key={col.id}
                className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={extraCols.includes(col.id)}
                  onChange={() => toggleCol(col.id)}
                  className="rounded"
                />
                {col.label}
              </label>
            ))}

            <div className="border-t border-[#dfdcd5] dark:border-[#333] my-1" />

            <div className="px-3 py-2 space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#595855] dark:text-[#808080]">
                Add custom parameter
              </p>
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                placeholder="e.g. Who led their last round?"
                maxLength={200}
                disabled={customColumnBusy}
                className="w-full px-2 py-1.5 rounded-md text-xs border border-[#dfdcd5] dark:border-[#333] bg-[#ebebeb] dark:bg-[#0a0a0a] text-black dark:text-white placeholder:text-[#808080]"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customQuery.trim() || customColumnBusy || !onAddCustomColumn}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-black text-white dark:bg-white dark:text-black disabled:opacity-40 cursor-pointer border-none"
              >
                {customColumnBusy ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Researching…
                  </>
                ) : (
                  <>
                    <Plus size={12} />
                    Add
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-[9px] border border-[#dfdcd5] dark:border-[#222222] bg-white dark:bg-[#111]">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-[#dfdcd5] dark:border-[#222222] bg-[#e7e5e4]/50 dark:bg-[#151515]">
              {headerLabels.map((col, i) => {
                const customCol =
                  i >= 6 + activeOptional.length
                    ? customColumns[i - 6 - activeOptional.length]
                    : null;
                return (
                  <th
                    key={`${col}-${i}`}
                    className="px-3 py-2.5 text-[9px] font-mono font-bold uppercase tracking-wider text-[#595855] dark:text-[#808080] first:pl-4 last:pr-4"
                  >
                    <span className="inline-flex items-center gap-1 max-w-[160px]">
                      {customCol?.loading ? (
                        <Loader2 size={10} className="animate-spin shrink-0" />
                      ) : null}
                      <span className="truncate" title={customCol?.query ?? col}>
                        {col}
                      </span>
                      {customCol && onRemoveCustomColumn ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveCustomColumn(customCol.id);
                          }}
                          className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer border-none bg-transparent text-[#595855] dark:text-[#808080]"
                          aria-label={`Remove ${customCol.label}`}
                        >
                          <X size={10} />
                        </button>
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {companies.map((co, idx) => (
              <tr
                key={`${co.domain}-${idx}`}
                onClick={() => onRowClick?.(co)}
                className="border-b border-[#dfdcd5]/60 dark:border-[#222222]/80 last:border-0 hover:bg-[#e7e5e4]/30 dark:hover:bg-white/[0.03] transition-colors cursor-pointer group"
              >
                <td className="px-3 py-3 pl-4 text-[11px] font-mono text-[#595855] dark:text-[#808080]">
                  {co.rank ?? idx + 1}
                </td>
                <td className="px-3 py-3">
                  <div className="font-davinci font-semibold text-sm text-black dark:text-white leading-tight">
                    {co.name}
                  </div>
                  {co.websiteUrl ? (
                    <a
                      href={co.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-[#595855] dark:text-[#808080] hover:underline inline-flex items-center gap-0.5 mt-0.5"
                    >
                      {co.domain}
                      <ExternalLink size={9} />
                    </a>
                  ) : (
                    <span className="text-[10px] text-[#595855] dark:text-[#808080]">{co.domain}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-black dark:text-white">{formatStage(co.stage)}</td>
                <td className="px-3 py-3 text-xs text-black dark:text-white max-w-[140px] truncate">
                  {co.geography}
                </td>
                <td className="px-3 py-3 text-xs text-black dark:text-white max-w-[160px] truncate">
                  {co.contactEmail ? (
                    <a
                      href={`mailto:${co.contactEmail}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {co.contactEmail}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-black dark:text-white">
                  {co.contactPhone ?? '—'}
                </td>
                {activeOptional.map((col) => (
                  <td
                    key={col.id}
                    className="px-3 py-3 text-xs text-black dark:text-white max-w-[180px] truncate"
                  >
                    {col.render(co)}
                  </td>
                ))}
                {customColumns.map((col) => (
                  <td
                    key={col.id}
                    className="px-3 py-3 text-xs text-black dark:text-white max-w-[180px] truncate"
                    title={customCellValue(col, co.domain)}
                  >
                    {customCellValue(col, co.domain)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
