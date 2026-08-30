import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { Search, Database, CheckCircle, ArrowRight, Sliders, Shield, Zap, Globe, Scale, FileSpreadsheet, FileText } from 'lucide-react';
import { ArchitectureDiagram } from '../components/ui/architecture-diagram';

// --- Square Monogram logo mark (SafetyKit-style squared brand) ---
const Monogram = ({ light = false }) => (
  <div
    className={`w-7 h-7 flex items-center justify-center font-sans font-bold text-[13px] ${
      light ? 'bg-cream text-ink' : 'bg-ink text-cream'
    }`}
  >
    Z
  </div>
);

// --- Uppercase mono eyebrow label ---
const Eyebrow = ({ children, tone = 'muted', className = '' }) => (
  <span
    className={`font-mono text-[12px] uppercase tracking-[0.08em] leading-[1.2] ${
      tone === 'red' ? 'text-accent-red' : tone === 'white' ? 'text-white' : tone === 'cream' ? 'text-cream/70' : 'text-[#8f8b80]'
    } ${className}`}
  >
    {children}
  </span>
);

const TypewriterInput = ({ text }) => {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= text.length) {
        setDisplayed(text.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 45);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="flex-1 font-mono text-[12px] tracking-tight text-ink">
      {displayed}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="inline-block w-[6px] h-3.5 ml-1 bg-accent-red align-middle"
      />
    </div>
  );
};

function Landing() {
  const navigate = useNavigate();

  // --- Walkthrough Sticky Scroll State ---
  const [activeStep, setActiveStep] = useState(0);
  const technologyRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: technologyRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    const step = Math.min(Math.floor(latest * 5.2), 4);
    setActiveStep(step);
  });

  // --- Card 1: Mandate criteria reveal ---
  const MANDATE_CRITERIA = [
    'Sector: B2B Software',
    'Region: Germany',
    'Revenue: $15M–$40M',
    'Employees: 50–200',
  ];
  const [criteriaVisible, setCriteriaVisible] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCriteriaVisible((v) => (v >= MANDATE_CRITERIA.length ? 0 : v + 1));
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  // --- Card 4: Ranking reorder state ---
  const [startups, setStartups] = useState([
    { id: 1, name: 'MatureSoft GmbH', score: 94, band: 'On thesis' },
    { id: 2, name: 'GrowthPay AG', score: 88, band: 'On thesis' },
    { id: 3, name: 'LedgerFlow', score: 72, band: 'Unknown' },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setStartups((prev) => {
        const arr = [...prev];
        arr[0].score = Math.floor(Math.random() * 8) + 90;
        arr[1].score = Math.floor(Math.random() * 12) + 82;
        return arr.sort((a, b) => b.score - a.score);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const PE_FEATURES = [
    { icon: Scale, title: 'Revenue & EBITDA bands', desc: 'Size your mandate with revenue or EBITDA thresholds — Meredian sources and vets companies against those financial bands.' },
    { icon: Globe, title: 'Geography filter', desc: 'When your mandate specifies a market, companies outside that geography are excluded from the shortlist.' },
    { icon: Shield, title: 'Mandate vetting', desc: 'Events, incumbents, and thesis mismatches are flagged in a separate section with clear exclusion reasons.' },
    { icon: Search, title: 'Live web research', desc: 'New mandates trigger a fresh market scan, followed by individual company profiles from public sources.' },
    { icon: Database, title: 'Research memory', desc: 'Repeat searches draw on prior work. Company profiles refresh automatically when information goes stale.' },
    { icon: FileSpreadsheet, title: 'Diligence export', desc: 'Ranked shortlist, expandable profiles, and one-click CSV or PDF export for your deal team.' },
  ];

  const FLOW_NODES = [
    { label: 'Mandate', accent: 'text-ink' },
    { label: 'Recall', accent: 'text-accent-blue' },
    { label: 'Research', accent: 'text-accent-amber' },
    { label: 'Vet', accent: 'text-accent-red' },
    { label: 'Shortlist', accent: 'text-accent-green' },
  ];

  const btnPrimary =
    'inline-flex items-center justify-center gap-2 h-[46px] px-6 bg-accent-red text-white font-mono text-[13px] font-medium uppercase tracking-[0.06em] hover:brightness-105 transition-all cursor-pointer';
  const btnDark =
    'inline-flex items-center justify-center gap-2 h-[46px] px-6 bg-ink text-cream font-mono text-[13px] font-medium uppercase tracking-[0.06em] hover:bg-ink/90 transition-all cursor-pointer';
  const btnOutline =
    'inline-flex items-center justify-center gap-2 h-[46px] px-6 bg-cream text-ink border border-ink/25 font-mono text-[13px] font-medium uppercase tracking-[0.06em] hover:border-ink transition-all cursor-pointer';

  return (
    <div className="min-h-screen bg-cream text-ink font-sans antialiased overflow-x-clip selection:bg-ink selection:text-cream">

      {/* 1. Header Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-cream/95 backdrop-blur border-b border-hairline h-16">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Monogram />
            <span className="font-sans font-bold text-[15px] tracking-tight">Meredian</span>
          </div>
          <div className="flex items-center gap-7">
            <a href="#features" className="font-mono text-[12px] uppercase tracking-[0.08em] text-secondary hover:text-accent-red transition-colors hidden sm:inline">
              Capabilities
            </a>
            <a href="#technology" className="font-mono text-[12px] uppercase tracking-[0.08em] text-secondary hover:text-accent-red transition-colors hidden sm:inline">
              How It Works
            </a>
            <button
              onClick={() => navigate('/chat')}
              className="inline-flex items-center h-[38px] px-5 bg-ink text-cream font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-accent-red hover:text-white transition-colors cursor-pointer"
            >
              Request Access
            </button>
          </div>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <section className="relative pt-36 pb-24 px-6 border-b border-hairline bg-cream overflow-hidden">
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
            <Eyebrow tone="red">AI Sourcing for Private Equity</Eyebrow>
          </div>

          <h1 className="text-[44px] sm:text-[62px] md:text-[76px] font-sans font-semibold tracking-[-0.03em] leading-[0.98] mb-7 max-w-4xl">
            Source the right companies as your thesis takes shape.
          </h1>

          <p className="text-secondary text-[16px] md:text-[18px] max-w-xl mx-auto leading-[1.55] mb-9">
            Describe your investment mandate in plain English — sector, geography, revenue or EBITDA bands. Meredian researches the market, vets each company against your thesis, and returns a ranked shortlist you can export for diligence.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-14">
            <button onClick={() => navigate('/chat')} className={btnPrimary}>
              Start a Mandate <ArrowRight size={15} />
            </button>
            <button onClick={() => navigate('/chat')} className={btnOutline}>
              See an Example
            </button>
          </div>

          {/* Data-flow diagram — mandate to shortlist */}
          <div className="w-full max-w-3xl border border-hairline bg-[#fbf7ec]">
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-hairline">
              <Eyebrow>Pipeline</Eyebrow>
              <span className="font-mono text-[11px] text-[#8f8b80]">mandate → shortlist</span>
            </div>
            <div className="flex items-stretch justify-between px-4 py-8 gap-1 overflow-x-auto">
              {FLOW_NODES.map((node, i) => (
                <React.Fragment key={node.label}>
                  <div className="flex flex-col items-center gap-2 min-w-[64px]">
                    <div className={`w-11 h-11 border border-ink/20 flex items-center justify-center ${node.accent}`}>
                      <span className="font-mono text-[13px] font-semibold">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-secondary">{node.label}</span>
                  </div>
                  {i < FLOW_NODES.length - 1 && (
                    <div className="flex items-center flex-1 min-w-[16px] pb-6">
                      <div className="h-px w-full bg-ink/15 relative">
                        <ArrowRight size={12} className="text-ink/30 absolute -right-1 -top-[6px]" />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Sources marquee */}
      <section className="py-6 border-b border-hairline bg-cream relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 mb-4">
          <Eyebrow>Reads from public sources</Eyebrow>
        </div>
        <div className="w-full flex">
          <motion.div
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
            className="flex gap-14 items-center whitespace-nowrap px-6"
          >
            {Array(4)
              .fill([
                'Revenue & EBITDA Bands',
                'Press & Filings',
                'Company Websites',
                'Crunchbase',
                'Mandate Vetting',
                'Source Provenance',
              ])
              .flat()
              .map((name, idx) => (
                <span key={idx} className="font-sans text-[18px] text-secondary tracking-tight">
                  {name}
                </span>
              ))}
          </motion.div>
        </div>
      </section>

      {/* 4. Product showcase — the mandate input (dark band) */}
      <section className="relative py-24 px-6 border-b border-hairline bg-ink text-cream overflow-hidden">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <Eyebrow tone="white">Plain-English mandates</Eyebrow>
            <h2 className="text-[34px] md:text-[44px] font-sans font-semibold tracking-[-0.02em] leading-[1.05] mt-4 mb-5">
              Type your thesis. Get a vetted shortlist.
            </h2>
            <p className="text-cream/70 text-[16px] leading-[1.55] max-w-md">
              No filters to configure, no rigid forms. Meredian parses your mandate into structured criteria — sector, geography, financial bands — then goes to work.
            </p>
            <button onClick={() => navigate('/chat')} className={`${btnPrimary} mt-8`}>
              Try an Example <ArrowRight size={15} />
            </button>
          </div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            className="bg-[#1c1c1c] border border-cream/10 p-7 flex flex-col justify-between gap-6"
          >
            <div className="border-b border-cream/10 pb-4">
              <Eyebrow tone="cream">Your Mandate</Eyebrow>
              <h3 className="font-sans text-[22px] font-medium mt-1.5">Example Search</h3>
            </div>

            <div className="bg-ink p-4 border border-cream/10 flex items-center min-h-[64px]">
              <Search size={14} className="text-cream/40 mr-2.5 shrink-0" />
              <TypewriterInput text="B2B software companies in Germany with $15M–$40M revenue and 50–200 employees…" />
            </div>

            <div className="flex justify-between items-end pt-4 border-t border-cream/10">
              <span className="font-mono text-[10px] tracking-[0.08em] text-cream/50 uppercase">Sample mandate</span>
              <button
                onClick={() => navigate('/chat')}
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-accent-red hover:text-cream flex items-center gap-1.5 transition-colors"
              >
                Run it <ArrowRight size={11} />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 5. Bento grid — From Mandate to Shortlist */}
      <section id="features" className="py-24 px-6 bg-cream border-b border-hairline">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <Eyebrow tone="red">How Meredian Works</Eyebrow>
            <h2 className="text-[34px] md:text-[44px] font-sans font-semibold tracking-[-0.02em] leading-[1.05] mt-4">
              From mandate to shortlist.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-hairline border border-hairline auto-rows-[280px]">

            {/* Card 1 */}
            <div className="md:col-span-2 bg-cream p-8 flex flex-col justify-between overflow-hidden group">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <FileText className="text-accent-red" size={16} />
                  <h3 className="font-sans font-semibold text-[18px]">Write Your Mandate</h3>
                </div>
                <p className="text-secondary text-[13px] leading-[1.5]">Describe your thesis in plain English — sector, geography, revenue, EBITDA, and headcount.</p>
              </div>
              <div className="bg-[#fbf7ec] border border-hairline h-32 p-4 overflow-hidden flex flex-col justify-center gap-2">
                {MANDATE_CRITERIA.map((criterion, i) => (
                  <motion.div
                    key={criterion}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: criteriaVisible > i ? 1 : 0.25, x: criteriaVisible > i ? 0 : -8 }}
                    className="text-[11px] font-mono text-ink flex items-center gap-2"
                  >
                    <span className="w-1 h-1 bg-accent-red shrink-0" />
                    {criterion}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-cream p-8 flex flex-col justify-between relative overflow-hidden group">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <Database className="text-accent-blue" size={16} />
                  <h3 className="font-sans font-semibold text-[18px]">Prior Research</h3>
                </div>
                <p className="text-secondary text-[13px] leading-[1.5]">Repeat mandates draw on saved company profiles; outdated records refresh automatically.</p>
              </div>
              <div className="flex flex-col items-center justify-center h-24 relative">
                <svg width="56" height="56" viewBox="0 0 100 100">
                  <ellipse cx="50" cy="25" rx="35" ry="15" fill="none" stroke="rgba(20,20,20,0.15)" strokeWidth="2" />
                  <path d="M 15 25 L 15 75 A 35 15 0 0 0 85 75 L 85 25" fill="none" stroke="rgba(20,20,20,0.15)" strokeWidth="2" />
                  <motion.ellipse
                    cx="50" cy="25" rx="35" ry="15" fill="none" stroke="#64a7cc" strokeWidth="3"
                    initial={{ strokeDasharray: '200', strokeDashoffset: '200' }}
                    animate={{ strokeDashoffset: '0' }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                  />
                </svg>
                <div className="text-[10px] font-mono font-semibold text-ink mt-2 uppercase tracking-[0.06em]">142 profiles on file</div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-cream p-8 flex flex-col justify-between group relative">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <Search className="text-accent-amber" size={16} />
                  <h3 className="font-sans font-semibold text-[18px]">Live Market Research</h3>
                </div>
                <p className="text-secondary text-[13px] leading-[1.5]">New mandates get a fresh scan across public web sources, then individual company profiles.</p>
              </div>
              <div className="relative h-28 flex flex-col items-center justify-center gap-2">
                <motion.div
                  className="w-full bg-[#fbf7ec] border border-hairline px-3 py-2 text-[10px] font-mono text-secondary flex items-center gap-2"
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Search size={10} /> Scanning web sources…
                </motion.div>
                <div className="w-full bg-ink text-cream px-3 py-2 text-[10px] font-mono flex items-center gap-2">
                  <Zap size={10} className="text-accent-amber" /> 8 candidates · domains verified
                </div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="md:col-span-2 bg-cream p-8 flex flex-col justify-between group">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <Sliders className="text-accent-green" size={16} />
                  <h3 className="font-sans font-semibold text-[18px]">Ranked by Mandate Fit</h3>
                </div>
                <p className="text-secondary text-[13px] leading-[1.5]">Companies scored against your financial bands and investment thesis — best fits rise to the top.</p>
              </div>
              <div className="bg-[#fbf7ec] border border-hairline p-3 mt-4">
                <motion.ul layout className="flex flex-col gap-1.5">
                  <AnimatePresence>
                    {startups.map((startup) => (
                      <motion.li
                        layout
                        key={startup.id}
                        className="bg-cream border border-hairline p-2 flex justify-between items-center relative cursor-default text-[12px]"
                      >
                        <span className="font-medium">{startup.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[9px] px-1.5 py-0.5 uppercase tracking-[0.04em] ${startup.band === 'On thesis' ? 'bg-accent-green text-cream' : 'bg-hairline text-secondary'}`}>{startup.band}</span>
                          <span className="bg-ink text-cream px-2 py-0.5 text-[10px] font-mono">{startup.score}% fit</span>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </motion.ul>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 6. Dark coverage section — evaluate the whole company */}
      <section className="py-28 px-6 bg-ink text-cream">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-16">
            <Eyebrow tone="white">Complete Coverage</Eyebrow>
            <h2 className="text-[38px] md:text-[56px] font-sans font-semibold leading-[1.02] tracking-[-0.02em] mt-4">
              One workflow. Every part of the mandate.
            </h2>
            <p className="text-cream/60 text-[16px] leading-[1.55] mt-5">
              Meredian evaluates the whole opportunity — not just a name on a list. Financial bands, geography, ownership, and thesis fit are checked together, with every exclusion reasoned.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-5">
            {[
              'Revenue band fit', 'EBITDA in range', 'Geography match',
              'Ownership & control', 'Incumbent exclusion', 'Event vs. operator',
              'Thesis alignment', 'Domain verification', 'Source provenance',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 border-t border-cream/10 pt-4">
                <span className="w-1.5 h-1.5 bg-accent-red shrink-0" />
                <span className="font-mono text-[13px] uppercase tracking-[0.04em] text-cream/85">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6b. Capabilities grid */}
      <section id="product" className="py-24 px-6 bg-cream border-b border-hairline">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <Eyebrow tone="red">Capabilities</Eyebrow>
            <h2 className="text-[34px] md:text-[44px] font-sans font-semibold text-ink tracking-[-0.02em] leading-[1.05] mt-4">
              Built for PE diligence.
            </h2>
            <p className="text-secondary text-[16px] max-w-lg mt-4 leading-[1.55]">
              Every step respects your financial bands, geography, and thesis — not generic startup lists.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-hairline border border-hairline">
            {PE_FEATURES.map((feat) => (
              <div key={feat.title} className="bg-cream p-7 hover:bg-[#fbf7ec] transition-colors">
                <feat.icon size={20} className="text-accent-red mb-5" />
                <h3 className="font-sans font-semibold text-[17px] mb-2">{feat.title}</h3>
                <p className="text-secondary text-[13px] leading-[1.55]">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Sticky scroll walkthrough */}
      <section id="technology" ref={technologyRef} className="py-28 bg-cream border-b border-hairline relative min-h-[280vh]">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 relative">

          {/* Left text column */}
          <div className="space-y-40 py-16">
            <div className="max-w-md">
              <Eyebrow tone="red">Process Flow</Eyebrow>
              <h2 className="text-[32px] md:text-[40px] font-sans font-semibold text-ink tracking-[-0.02em] leading-[1.05] mt-4">
                How sourcing works.
              </h2>
              <p className="text-secondary text-[15px] mt-4 leading-[1.55]">
                From mandate to research, vetting, and a diligence-ready shortlist — in one conversational workflow.
              </p>
            </div>

            {[
              { n: '01', tag: 'Your Mandate', h: 'Understand the Thesis', p: 'Describe what you are looking for in plain English. Meredian extracts sector, geography, revenue or EBITDA bands, and headcount into structured search criteria.' },
              { n: '02', tag: 'Prior Research', h: 'Check What We Already Know', p: 'Saved company profiles from prior mandates are checked first. Outdated records refresh automatically; new mandates trigger a fresh market scan.' },
              { n: '03', tag: 'Market Scan', h: 'Find Matching Companies', p: 'Web research runs against your mandate bands. Each candidate gets an individual profile — domain verification, press coverage, and financial signals from public sources.' },
              { n: '04', tag: 'Mandate Vetting', h: 'Filter to Real Opportunities', p: 'Companies outside your revenue or EBITDA bands are excluded. Events, incumbents, and geography mismatches are flagged with clear reasons.' },
              { n: '05', tag: 'Your Shortlist', h: 'Ready for Diligence', p: 'A ranked shortlist with mandate-fit scores, expandable company profiles, exclusion summaries, and one-click CSV or PDF export for your deal team.' },
            ].map((s, i) => (
              <div key={s.n} className={`space-y-3 max-w-md transition-opacity duration-300 ${activeStep === i ? 'opacity-100' : 'opacity-30'}`}>
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-secondary flex items-center gap-3">
                  <span className={`w-7 h-7 border flex items-center justify-center text-[11px] ${activeStep === i ? 'border-accent-red text-accent-red' : 'border-ink/20'}`}>{s.n}</span>
                  {s.tag}
                </div>
                <h3 className="text-[22px] font-sans font-semibold">{s.h}</h3>
                <p className="text-secondary leading-[1.55] text-[14px]">{s.p}</p>
              </div>
            ))}
          </div>

          {/* Right pinned visual panel */}
          <div className="hidden lg:block sticky top-24 h-[550px] w-full self-start border border-hairline bg-[#fbf7ec] overflow-hidden">
            <div className="absolute inset-0 p-8 flex items-center justify-center">
              <AnimatePresence mode="wait">

                {activeStep === 0 && (
                  <motion.div key="step0" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm flex flex-col gap-4">
                    <div className="bg-cream border border-hairline p-5 text-[11px]">
                      <div className="text-secondary mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
                        <FileText size={12} /> Your Mandate
                      </div>
                      <p className="text-ink leading-[1.55] mb-3 text-[13px]">
                        B2B software companies in Germany with $15M–$40M revenue and 50–200 employees
                      </p>
                      <div className="space-y-1.5 pt-2 border-t border-hairline font-mono text-[11px]">
                        <div className="text-secondary">Sector · B2B Software</div>
                        <div className="text-secondary">Region · Germany</div>
                        <div className="text-secondary">Revenue · $15M–$40M</div>
                      </div>
                    </div>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto bg-ink text-cream font-mono text-[10px] uppercase tracking-[0.06em] px-3.5 py-2 flex items-center gap-2">
                      <CheckCircle size={12} className="text-accent-green" /> Criteria captured
                    </motion.div>
                  </motion.div>
                )}

                {activeStep === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm flex flex-col gap-4">
                    <div className="bg-cream border border-hairline p-5 text-[11px]">
                      <div className="text-secondary mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
                        <Database size={12} /> Prior Research
                      </div>
                      <div className="flex items-center gap-2 text-ink text-[13px]">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-3 h-3 border border-accent-blue border-t-transparent rounded-full" />
                        Checking saved company profiles…
                      </div>
                    </div>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto bg-ink text-cream font-mono text-[10px] uppercase tracking-[0.06em] px-3.5 py-2 flex items-center gap-2">
                      <Zap size={12} className="text-accent-amber" /> New market scan needed
                    </motion.div>
                  </motion.div>
                )}

                {activeStep === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm space-y-3">
                    <div className="font-mono text-[10px] text-secondary mb-2 flex justify-between items-center uppercase tracking-[0.08em]">
                      <span>Market Scan</span>
                      <span className="flex items-center gap-1"><Search size={12} /> Live research</span>
                    </div>
                    {[
                      { source: 'Mandate search', desc: 'B2B software · Germany · $15M–$40M', progress: '100%', delay: 0.1 },
                      { source: 'MatureSoft GmbH', desc: 'Company profile & financials', progress: '100%', delay: 0.3 },
                      { source: 'GrowthPay AG', desc: 'Domain & ownership verification', progress: '85%', delay: 0.5 },
                      { source: 'LedgerFlow', desc: 'Press & filings review', progress: '70%', delay: 0.7 },
                    ].map((item) => (
                      <div key={item.source} className="bg-cream border border-hairline p-3">
                        <div className="flex justify-between text-[11px] font-medium text-ink mb-1">
                          <span>{item.source}</span>
                          <span className="font-mono">{item.progress}</span>
                        </div>
                        <div className="text-[9px] text-secondary mb-1.5 font-mono">{item.desc}</div>
                        <div className="h-1 w-full bg-hairline overflow-hidden">
                          <motion.div initial={{ width: '0%' }} animate={{ width: item.progress }} transition={{ duration: 1.5, delay: item.delay }} className="h-full bg-accent-amber" />
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}

                {activeStep === 3 && (
                  <motion.div key="step3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm flex flex-col gap-3">
                    <div className="font-mono text-[10px] text-secondary mb-1 uppercase tracking-[0.08em]">Mandate Vetting</div>
                    {[
                      { name: 'MatureSoft GmbH', status: 'PASS', reason: 'Within revenue band' },
                      { name: 'GrowthPay AG', status: 'PASS', reason: 'EBITDA in range' },
                      { name: 'India Fintech Forum', status: 'Excluded', reason: 'Event, not operating company' },
                    ].map((item, i) => (
                      <motion.div key={item.name} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.15 }} className="bg-cream border border-hairline p-3 text-[10px]">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-ink text-[12px]">{item.name}</span>
                          <span className={`font-mono px-1.5 py-0.5 text-[9px] uppercase tracking-[0.04em] ${item.status === 'PASS' ? 'bg-accent-green text-cream' : 'bg-accent-red text-cream'}`}>{item.status}</span>
                        </div>
                        <div className="text-secondary font-mono">{item.reason}</div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {activeStep === 4 && (
                  <motion.div key="step4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full h-full pt-8 flex flex-col justify-end">
                    <div className="bg-cream border border-hairline w-full max-w-sm mx-auto p-5 flex flex-col gap-4">
                      <div className="font-mono text-[10px] text-secondary uppercase tracking-[0.08em]">Diligence Shortlist · 5 on thesis</div>
                      <div className="space-y-2">
                        {['MatureSoft GmbH · 94% fit', 'GrowthPay AG · 88% fit'].map((row) => (
                          <div key={row} className="flex justify-between text-[12px] border-b border-hairline pb-1.5">
                            <span>{row.split(' · ')[0]}</span>
                            <span className="font-mono font-medium">{row.split(' · ')[1]}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 bg-ink text-cream flex items-center justify-center font-bold text-[12px] shrink-0">Z</div>
                        <div className="bg-[#fbf7ec] border border-hairline p-3 text-[11px] text-ink leading-[1.55]">
                          5 companies passed mandate vetting. 2 excluded — one event, one geography mismatch. Ready to export for your deal team.
                        </div>
                      </div>
                      <button onClick={() => navigate('/chat')} className="mt-2 w-full h-[44px] bg-accent-red text-white font-mono text-[12px] uppercase tracking-[0.06em] flex items-center justify-center gap-2 hover:brightness-105 transition-all">
                        <FileSpreadsheet size={13} /> Export Shortlist CSV
                      </button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>

        </div>
      </section>

      {/* 8. Workflow diagram */}
      <section className="py-24 px-6 bg-cream border-b border-hairline">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 max-w-2xl">
            <Eyebrow tone="red">At a Glance</Eyebrow>
            <h2 className="text-[32px] md:text-[40px] font-sans font-semibold text-ink tracking-[-0.02em] leading-[1.05] mt-4 mb-3">
              The sourcing workflow.
            </h2>
            <p className="text-secondary text-[15px] max-w-md leading-[1.55]">Mandate → research → vet → shortlist. A single workflow from thesis to diligence-ready output.</p>
          </div>
          <div className="h-[480px] border border-hairline bg-[#fbf7ec] overflow-hidden">
            <ArchitectureDiagram />
          </div>
        </div>
      </section>

      {/* 9. Footer CTA */}
      <footer className="bg-ink text-cream py-28 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <Eyebrow tone="white">Start Sourcing</Eyebrow>
          <h3 className="text-[40px] md:text-[64px] font-sans font-semibold tracking-[-0.03em] leading-[0.98]">
            Run a mandate.<br />Get a shortlist.
          </h3>
          <p className="text-cream/60 text-[16px] max-w-md mx-auto leading-[1.55]">
            Run PE mandates in natural language. Get a vetted shortlist with financial-band fit, clear exclusion reasons, and export-ready tables for your deal team.
          </p>
          <div className="flex justify-center pt-2">
            <button onClick={() => navigate('/chat')} className={btnPrimary}>
              Request a Demo <ArrowRight size={15} />
            </button>
          </div>

          <div className="pt-20 mt-8 border-t border-cream/10 flex flex-col md:flex-row items-center justify-between gap-6 text-[12px] text-cream/60">
            <div className="flex items-center gap-2.5">
              <Monogram light />
              <span className="font-sans font-bold text-cream">Meredian</span>
            </div>
            <div className="flex gap-7 font-mono uppercase tracking-[0.08em] text-[11px]">
              <a href="#features" className="hover:text-cream transition-colors">Overview</a>
              <a href="#product" className="hover:text-cream transition-colors">Capabilities</a>
              <a href="#technology" className="hover:text-cream transition-colors">How It Works</a>
            </div>
            <span className="font-mono text-[11px]">© 2026 Meredian AI Sourcing</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default Landing;
