import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { Search, Database, CheckCircle, ArrowRight, Sliders, Shield, Zap, Moon, Globe, Scale, FileSpreadsheet, FileText } from 'lucide-react';
import { ThemeContext } from '../App';
import { ArchitectureDiagram } from '../components/ui/architecture-diagram';

// --- Circled Z Monogram logo mark ---
const CircledZMonogram = ({ dark = false }) => (
  <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-davinci font-bold text-sm ${dark ? 'border-white text-white' : 'border-black text-black'}`}>
    Z
  </div>
);

// --- Hexagonal Outline Nav Indicator ---
const HexagonalIndicator = ({ active = false, dark = false }) => (
  <svg width="14" height="14" viewBox="0 0 100 100" className="inline-block mx-1">
    <polygon 
      points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" 
      fill={active ? (dark ? '#ffffff' : '#000000') : 'transparent'} 
      stroke={dark ? '#ffffff' : '#000000'} 
      strokeWidth="10" 
    />
  </svg>
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
    }, 50);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="flex-1 font-helvetica-now text-[13px] tracking-tight text-[#000000] dark:text-[#E2E8F0]">
      {displayed}
      <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} className="inline-block w-1 h-3.5 ml-1 bg-black dark:bg-[#E2E8F0] align-middle" />
    </div>
  );
};

function Landing() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useContext(ThemeContext);

  // --- Walkthrough Sticky Scroll State ---
  const [activeStep, setActiveStep] = useState(0);
  const technologyRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: technologyRef,
    offset: ["start start", "end end"]
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const step = Math.min(Math.floor(latest * 5.2), 4);
    setActiveStep(step);
  });

  // --- Bento Grid Card 1: Mandate criteria reveal ---
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

  // --- Bento Grid Card 4: Ranking Reorder State ---
  const [startups, setStartups] = useState([
    { id: 1, name: 'MatureSoft GmbH', score: 94, band: 'On thesis' },
    { id: 2, name: 'GrowthPay AG', score: 88, band: 'On thesis' },
    { id: 3, name: 'LedgerFlow', score: 72, band: 'Unknown' },
  ]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStartups(prev => {
        const arr = [...prev];
        arr[0].score = Math.floor(Math.random() * 8) + 90;
        arr[1].score = Math.floor(Math.random() * 12) + 82;
        return arr.sort((a, b) => b.score - a.score);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const PE_FEATURES = [
    { icon: Scale, title: 'Revenue & EBITDA bands', desc: 'Size your mandate with revenue or EBITDA thresholds — Zoron sources and vets companies against those financial bands.' },
    { icon: Globe, title: 'Geography filter', desc: 'When your mandate specifies a market, companies outside that geography are excluded from the shortlist.' },
    { icon: Shield, title: 'Mandate vetting', desc: 'Events, incumbents, and thesis mismatches are flagged in a separate section with clear exclusion reasons.' },
    { icon: Search, title: 'Live web research', desc: 'New mandates trigger a fresh market scan, followed by individual company profiles from public sources.' },
    { icon: Database, title: 'Research memory', desc: 'Repeat searches draw on prior work. Company profiles refresh automatically when information goes stale.' },
    { icon: FileSpreadsheet, title: 'Diligence export', desc: 'Ranked shortlist, expandable profiles, and one-click CSV or PDF export for your deal team.' },
  ];

  return (
    <div className="min-h-screen bg-[#c4c3b6] text-[#000000] font-helvetica-now transition-colors duration-500 overflow-x-clip selection:bg-black selection:text-white">
      
      {/* 1. Header Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#c4c3b6] border-b border-[#dfdcd5] h-16">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CircledZMonogram />
            <span className="font-davinci font-bold text-sm tracking-wider uppercase">Zoron AI</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#product" className="font-helvetica-now text-xs uppercase tracking-widest text-[#000000] hover:underline transition-all">
              Capabilities
            </a>
            <a href="#technology" className="font-helvetica-now text-xs uppercase tracking-widest text-[#000000] hover:underline transition-all hidden sm:inline">
              How It Works
            </a>
            <button 
              onClick={toggleTheme}
              className="p-1 rounded-[2px] hover:bg-black/5 transition-colors"
              aria-label="Toggle Theme"
            >
              <Moon size={14} className="text-[#000000]" />
            </button>
            <button 
              onClick={() => navigate('/chat')}
              className="px-[17px] py-[9px] bg-[#000000] text-white rounded-[28.8px] font-helvetica-now text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-none border-none"
            >
              Request Access
            </button>
          </div>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <section className="relative pt-40 pb-20 px-6 flex flex-col items-center justify-center text-center overflow-hidden bg-[#c4c3b6] z-10 border-b border-[#dfdcd5]">
        <div className="flex flex-col items-center w-full max-w-4xl mx-auto">
          

          <h1 className="text-[48px] sm:text-[68px] md:text-[80px] font-davinci font-medium text-[#000000] leading-[0.9] tracking-[-0.0150em] mb-6">
            Mandate-Driven<br />PE Sourcing.
          </h1>
          
          <p className="text-[#595855] text-sm md:text-base max-w-lg mx-auto font-normal leading-relaxed mb-8">
            Describe your investment mandate in plain English — sector, geography, revenue or EBITDA bands. Zoron researches the market, vets each company against your thesis, and returns a ranked shortlist you can export for diligence.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mb-10 font-helvetica-now text-xs font-semibold uppercase tracking-wider text-[#000000]">
            <span>Mandate in Plain English</span>
            <span className="w-1.5 h-1.5 rounded-full bg-black/40 hidden sm:block" />
            <span>Researched Shortlist</span>
            <span className="w-1.5 h-1.5 rounded-full bg-black/40 hidden sm:block" />
            <span>Export for Diligence</span>
          </div>

          <button 
            onClick={() => navigate('/chat')}
            className="px-[24px] py-[12px] bg-[#000000] text-white rounded-[28.8px] font-helvetica-now text-xs hover:opacity-90 transition-opacity cursor-pointer mb-16 shadow-none"
          >
            Start a Mandate
          </button>

          {/* Signature 374px Wordmark cropped at edges */}
          <div className="w-full select-none overflow-visible flex justify-center mt-8">
            <h2 className="text-[110px] sm:text-[220px] md:text-[374px] font-davinci font-medium text-[#000000] leading-[0.84] tracking-[-3.37px] translate-y-6 uppercase">
              Zoron 
            </h2>
          </div>

        </div>
      </section>

      {/* 3. Minimal Putty/Ink Marquee */}
      <section className="py-8 border-b border-[#dfdcd5] bg-[#c4c3b6] relative overflow-hidden">
        <div className="w-full flex">
          <motion.div 
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="flex gap-20 items-center whitespace-nowrap px-10"
          >
            {Array(4).fill([
              { name: 'Revenue & EBITDA Bands' },
              { name: 'Press & Filings' },
              { name: 'Company Websites' },
              { name: 'Crunchbase' },
              { name: 'Mandate Vetting' },
              { name: 'Source Provenance' },
            ]).flat().map((item, idx) => (
              <span key={idx} className="font-davinci text-lg italic text-[#595855] tracking-tight opacity-75">
                {item.name}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 4. Full-Bleed Painting Section with Notched Card */}
      <section className="relative h-[650px] w-full border-b border-[#dfdcd5] overflow-hidden flex items-center justify-center bg-[#808080]">
        
        {/* Background Painting */}
        <img 
          src="/images/renaissance_landscape.jpg" 
          alt="Renaissance Landscape" 
          className="absolute inset-0 w-full h-full object-cover filter brightness-[0.7] saturate-[0.8]" 
        />
        
        {/* Notched Product Card floating center */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          className="w-[380px] h-[380px] bg-[#000000] text-white p-8 flex flex-col justify-between relative shadow-none z-10"
          style={{
            clipPath: 'polygon(16px 0%, calc(100% - 16px) 0%, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0% calc(100% - 16px), 0% 16px)'
          }}
        >
          {/* Card header */}
          <div className="border-b border-white/10 pb-4">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#595855]">Your Mandate</span>
            <h3 className="font-davinci text-2xl font-medium mt-1">Example Search</h3>
          </div>

          {/* Typing simulation */}
          <div className="bg-[#151515] p-4 border border-white/5 rounded-[9px] flex items-center h-16 shadow-none">
            <Search size={14} className="text-[#595855] mr-2.5 shrink-0" />
            <TypewriterInput text="B2B software companies in Germany with $15M–$40M revenue and 50–200 employees..." />
          </div>

          {/* Card footer */}
          <div className="flex justify-between items-end pt-4 border-t border-white/10">
            <div className="text-[9px] font-mono tracking-widest text-[#dfdcd5]">
              Sample mandate
            </div>
            <button 
              onClick={() => navigate('/chat')}
              className="text-[10px] font-helvetica-now uppercase tracking-wider text-white hover:underline flex items-center gap-1.5"
            >
              Try an Example <ArrowRight size={10} />
            </button>
          </div>

        </motion.div>
      </section>

      {/* 5. Flat Architecture Bento Grid (Bone Cards) */}
      <section id="features" className="py-24 px-6 bg-[#c4c3b6] border-b border-[#dfdcd5]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#595855] mb-2">How Zoron Works</div>
            <h2 className="text-4xl font-davinci font-medium text-[#000000] tracking-tight">From Mandate to Shortlist</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[280px]">
            
            {/* Card 1: Write Your Mandate */}
            <div className="md:col-span-2 bg-[#e7e5e4] border border-[#dfdcd5] rounded-[9px] p-8 flex flex-col justify-between overflow-hidden shadow-none group">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <FileText className="text-[#000000]" size={16} />
                  <h3 className="font-davinci font-medium text-lg">Write Your Mandate</h3>
                </div>
                <p className="text-[#595855] text-xs">Describe your thesis in plain English — sector, geography, revenue, EBITDA, and headcount.</p>
              </div>
              
              <div className="bg-white border border-[#dfdcd5] h-32 rounded-[9px] p-4 overflow-hidden relative shadow-none flex flex-col justify-center gap-2">
                {MANDATE_CRITERIA.map((criterion, i) => (
                  <motion.div
                    key={criterion}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: criteriaVisible > i ? 1 : 0.25, x: criteriaVisible > i ? 0 : -8 }}
                    className="text-[11px] text-[#000000] flex items-center gap-2"
                  >
                    <span className="w-1 h-1 rounded-full bg-black shrink-0" />
                    {criterion}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Card 2: Prior Research */}
            <div className="bg-[#e7e5e4] border border-[#dfdcd5] rounded-[9px] p-8 flex flex-col justify-between shadow-none relative overflow-hidden group">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <Database className="text-[#000000]" size={16} />
                  <h3 className="font-davinci font-medium text-lg">Prior Research</h3>
                </div>
                <p className="text-[#595855] text-xs">Repeat mandates draw on saved company profiles; outdated records refresh automatically.</p>
              </div>
              
              <div className="flex flex-col items-center justify-center h-24 relative">
                <svg width="60" height="60" viewBox="0 0 100 100">
                  <ellipse cx="50" cy="25" rx="35" ry="15" fill="none" stroke="#dfdcd5" strokeWidth="2" />
                  <path d="M 15 25 L 15 75 A 35 15 0 0 0 85 75 L 85 25" fill="none" stroke="#dfdcd5" strokeWidth="2" />
                  <motion.ellipse 
                    cx="50" cy="25" rx="35" ry="15" fill="none" stroke="#000000" strokeWidth="3"
                    initial={{ strokeDasharray: "200", strokeDashoffset: "200" }}
                    animate={{ strokeDashoffset: "0" }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                  />
                </svg>
                <div className="text-[10px] font-helvetica-now font-semibold text-black mt-2 uppercase tracking-wide">
                  142 profiles on file
                </div>
              </div>
            </div>

            {/* Card 3: Live Market Research */}
            <div className="bg-[#e7e5e4] border border-[#dfdcd5] rounded-[9px] p-8 flex flex-col justify-between shadow-none group relative">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <Search className="text-[#000000]" size={16} />
                  <h3 className="font-davinci font-medium text-lg">Live Market Research</h3>
                </div>
                <p className="text-[#595855] text-xs">New mandates get a fresh scan across public web sources, then individual company profiles.</p>
              </div>
              
              <div className="relative h-28 flex flex-col items-center justify-center gap-2">
                <motion.div 
                  className="w-full bg-white border border-[#dfdcd5] rounded-[9px] px-3 py-2 text-[10px] text-[#595855] flex items-center gap-2"
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Search size={10} /> Scanning web sources…
                </motion.div>
                <motion.div 
                  className="w-full bg-black text-white rounded-[9px] px-3 py-2 text-[10px] flex items-center gap-2"
                  initial={{ opacity: 0.7 }}
                  whileHover={{ opacity: 1 }}
                >
                  <Zap size={10} /> 8 candidates · domains verified
                </motion.div>
              </div>
            </div>

            {/* Card 4: Ranked by Mandate Fit */}
            <div className="md:col-span-2 bg-[#e7e5e4] border border-[#dfdcd5] rounded-[9px] p-8 flex flex-col justify-between shadow-none group">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <Sliders className="text-[#000000]" size={16} />
                  <h3 className="font-davinci font-medium text-lg">Ranked by Mandate Fit</h3>
                </div>
                <p className="text-[#595855] text-xs">Companies scored against your financial bands and investment thesis — best fits rise to the top.</p>
              </div>

              <div className="bg-white rounded-[9px] border border-[#dfdcd5] p-3 shadow-none mt-4">
                <motion.ul layout className="flex flex-col gap-1.5">
                  <AnimatePresence>
                    {startups.map((startup) => (
                      <motion.li 
                        layout 
                        key={startup.id}
                        className="bg-white border border-[#dfdcd5] rounded-[9px] p-2 flex justify-between items-center shadow-none relative group/item cursor-default text-xs"
                      >
                        <span className="font-medium">{startup.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${startup.band === 'On thesis' ? 'bg-black text-white' : 'bg-[#dfdcd5] text-[#595855]'}`}>{startup.band}</span>
                          <span className="bg-[#e7e5e4] px-2 py-0.5 rounded text-[10px] font-medium">{startup.score}% fit</span>
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

      {/* 6. Dark Feature Section (Ink Room) with Circular Vignettes */}
      <section className="py-28 px-6 bg-[#000000] text-white">
        <div className="max-w-6xl mx-auto">
          
          <div className="text-center mb-20">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#595855] block mb-3">Exhibition Space</span>
            <h2 className="text-[48px] md:text-[94px] font-davinci font-medium leading-[0.84] tracking-[-0.85px] text-center uppercase">
              PE Sourcing Decoded
            </h2>
          </div>

          {/* 3-Column Vignette Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            
            {/* Vignette 1 */}
            <div className="flex flex-col items-center text-center">
              <h4 className="font-davinci text-[22px] font-normal mb-6">Define the Mandate</h4>
              <div className="w-[200px] h-[200px] rounded-full overflow-hidden mb-6 bg-[#808080] border-none shadow-none">
                <img 
                  src="/images/baroque_still_life.jpg" 
                  alt="Baroque Still Life" 
                  className="w-full h-full object-cover filter brightness-[0.8] saturate-[0.8]" 
                />
              </div>
              <div className="flex gap-1.5 justify-center">
                <HexagonalIndicator active={true} dark={true} />
                <HexagonalIndicator dark={true} />
                <HexagonalIndicator dark={true} />
              </div>
            </div>

            {/* Vignette 2 */}
            <div className="flex flex-col items-center text-center">
              <h4 className="font-davinci text-[22px] font-normal mb-6">Research the Market</h4>
              <div className="w-[200px] h-[200px] rounded-full overflow-hidden mb-6 bg-[#808080] border-none shadow-none">
                <img 
                  src="/images/renaissance_ruins.jpg" 
                  alt="Renaissance Ruins" 
                  className="w-full h-full object-cover filter brightness-[0.8] saturate-[0.8]" 
                />
              </div>
              <div className="flex gap-1.5 justify-center">
                <HexagonalIndicator dark={true} />
                <HexagonalIndicator active={true} dark={true} />
                <HexagonalIndicator dark={true} />
              </div>
            </div>

            {/* Vignette 3 */}
            <div className="flex flex-col items-center text-center">
              <h4 className="font-davinci text-[22px] font-normal mb-6">Vet for Fit</h4>
              <div className="w-[200px] h-[200px] rounded-full overflow-hidden mb-6 bg-[#808080] border-none shadow-none">
                <img 
                  src="/images/renaissance_sky.jpg" 
                  alt="Renaissance Sky" 
                  className="w-full h-full object-cover filter brightness-[0.8] saturate-[0.8]" 
                />
              </div>
              <div className="flex gap-1.5 justify-center">
                <HexagonalIndicator dark={true} />
                <HexagonalIndicator dark={true} />
                <HexagonalIndicator active={true} dark={true} />
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 6b. PE Mandate Capabilities */}
      <section id="product" className="py-24 px-6 bg-[#ebebeb] border-t border-[#dfdcd5]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#595855] block mb-2">Capabilities</span>
            <h2 className="text-3xl md:text-4xl font-davinci font-medium text-[#000000] tracking-tight">Built for PE Diligence</h2>
            <p className="text-[#595855] text-xs max-w-lg mx-auto mt-3 leading-relaxed">
              Every step respects your financial bands, geography, and thesis — not generic startup lists.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PE_FEATURES.map((feat) => (
              <div key={feat.title} className="bg-[#e7e5e4] border border-[#dfdcd5] rounded-[9px] p-6 shadow-none">
                <feat.icon size={18} className="text-[#000000] mb-4" />
                <h3 className="font-davinci font-medium text-base mb-2">{feat.title}</h3>
                <p className="text-[#595855] text-xs leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Product Walkthrough Sticky Scroll (Putty Background, Bone visual card) */}
      <section id="technology" ref={technologyRef} className="py-28 bg-[#c4c3b6] border-t border-[#dfdcd5] relative min-h-[280vh]">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 relative">
          
          {/* Left text column */}
          <div className="space-y-40 py-16">
            <div className="max-w-md">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#595855] block mb-2">Process flow</span>
              <h2 className="text-[34px] font-davinci font-medium text-[#000000] tracking-tight leading-tight">How Sourcing Works</h2>
              <p className="text-[#595855] text-xs mt-3 leading-relaxed">
                From mandate to research, vetting, and a diligence-ready shortlist — in one conversational workflow.
              </p>
            </div>

            <div className={`space-y-3 max-w-md transition-opacity duration-300 ${activeStep === 0 ? 'opacity-100' : 'opacity-30'}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#595855] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center text-[10px]">01</span>
                Your Mandate
              </div>
              <h3 className="text-xl font-davinci font-medium">Understand the Thesis</h3>
              <p className="text-[#595855] leading-relaxed text-xs">
                Describe what you are looking for in plain English. Zoron extracts sector, geography, revenue or EBITDA bands, and headcount into structured search criteria.
              </p>
            </div>

            <div className={`space-y-3 max-w-md transition-opacity duration-300 ${activeStep === 1 ? 'opacity-100' : 'opacity-30'}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#595855] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center text-[10px]">02</span>
                Prior Research
              </div>
              <h3 className="text-xl font-davinci font-medium">Check What We Already Know</h3>
              <p className="text-[#595855] leading-relaxed text-xs">
                Saved company profiles from prior mandates are checked first. Outdated records refresh automatically; new mandates trigger a fresh market scan.
              </p>
            </div>

            <div className={`space-y-3 max-w-md transition-opacity duration-300 ${activeStep === 2 ? 'opacity-100' : 'opacity-30'}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#595855] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center text-[10px]">03</span>
                Market Scan
              </div>
              <h3 className="text-xl font-davinci font-medium">Find Matching Companies</h3>
              <p className="text-[#595855] leading-relaxed text-xs">
                Web research runs against your mandate bands. Each candidate gets an individual profile — domain verification, press coverage, and financial signals from public sources.
              </p>
            </div>

            <div className={`space-y-3 max-w-md transition-opacity duration-300 ${activeStep === 3 ? 'opacity-100' : 'opacity-30'}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#595855] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center text-[10px]">04</span>
                Mandate Vetting
              </div>
              <h3 className="text-xl font-davinci font-medium">Filter to Real Opportunities</h3>
              <p className="text-[#595855] leading-relaxed text-xs">
                Companies outside your revenue or EBITDA bands are excluded. Events, incumbents, and geography mismatches are flagged with clear reasons — so you know what was screened out and why.
              </p>
            </div>

            <div className={`space-y-3 max-w-md transition-opacity duration-300 ${activeStep === 4 ? 'opacity-100' : 'opacity-30'}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#595855] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center text-[10px]">05</span>
                Your Shortlist
              </div>
              <h3 className="text-xl font-davinci font-medium">Ready for Diligence</h3>
              <p className="text-[#595855] leading-relaxed text-xs">
                A ranked shortlist with mandate-fit scores, expandable company profiles, exclusion summaries, and one-click CSV or PDF export for your deal team.
              </p>
            </div>
          </div>

          {/* Right pinned visual panel (Bone Card style, flat, border-radius 9px) */}
          <div className="hidden lg:block sticky top-24 h-[550px] w-full self-start rounded-[9px] border border-[#dfdcd5] bg-[#e7e5e4] shadow-none overflow-hidden">
            <div className="absolute inset-0 p-8 flex items-center justify-center">
              <AnimatePresence mode="wait">
                
                {activeStep === 0 && (
                  <motion.div key="step0" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm flex flex-col gap-4">
                    <div className="bg-white border border-[#dfdcd5] rounded-[9px] p-5 text-[11px] shadow-none">
                      <div className="text-[#595855] mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                        <FileText size={12} /> Your Mandate
                      </div>
                      <p className="text-black leading-relaxed mb-3">
                        B2B software companies in Germany with $15M–$40M revenue and 50–200 employees
                      </p>
                      <div className="space-y-1.5 pt-2 border-t border-[#dfdcd5]">
                        <div className="text-[#595855]">Sector · B2B Software</div>
                        <div className="text-[#595855]">Region · Germany</div>
                        <div className="text-[#595855]">Revenue · $15M–$40M</div>
                      </div>
                    </div>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto bg-black text-white text-[10px] px-3.5 py-1.5 rounded-[28.8px] flex items-center gap-2 shadow-none">
                      <CheckCircle size={12} /> Criteria captured
                    </motion.div>
                  </motion.div>
                )}

                {activeStep === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm flex flex-col gap-4">
                    <div className="bg-white border border-[#dfdcd5] rounded-[9px] p-5 text-[11px] shadow-none">
                      <div className="text-[#595855] mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                        <Database size={12} /> Prior Research
                      </div>
                      <div className="flex items-center gap-2 text-black">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-3 h-3 border border-current border-t-transparent rounded-full" />
                        Checking saved company profiles…
                      </div>
                    </div>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto bg-black text-white text-[10px] px-3.5 py-1.5 rounded-[28.8px] flex items-center gap-2 shadow-none">
                      <Zap size={12} /> New market scan needed
                    </motion.div>
                  </motion.div>
                )}

                {activeStep === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm space-y-4">
                    <div className="text-[10px] text-[#595855] mb-2 flex justify-between items-center uppercase tracking-widest">
                      <span>Market Scan</span>
                      <span className="flex items-center gap-1"><Search size={12} /> Live research</span>
                    </div>
                    {[
                      { source: 'Mandate search', desc: 'B2B software · Germany · $15M–$40M', progress: '100%', delay: 0.1 },
                      { source: 'MatureSoft GmbH', desc: 'Company profile & financials', progress: '100%', delay: 0.3 },
                      { source: 'GrowthPay AG', desc: 'Domain & ownership verification', progress: '85%', delay: 0.5 },
                      { source: 'LedgerFlow', desc: 'Press & filings review', progress: '70%', delay: 0.7 }
                    ].map((item) => (
                      <div key={item.source} className="bg-white border border-[#dfdcd5] rounded-[9px] p-3 shadow-none">
                        <div className="flex justify-between text-[11px] font-medium text-black mb-1">
                          <span>{item.source}</span>
                          <span>{item.progress}</span>
                        </div>
                        <div className="text-[9px] text-[#595855] mb-1.5">{item.desc}</div>
                        <div className="h-1 w-full bg-[#dfdcd5] rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: "0%" }} 
                            animate={{ width: item.progress }} 
                            transition={{ duration: 1.5, delay: item.delay }} 
                            className="h-full bg-black" 
                          />
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}

                {activeStep === 3 && (
                  <motion.div key="step3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full max-w-sm flex flex-col gap-3">
                    <div className="text-[10px] text-[#595855] mb-1 uppercase tracking-widest">Mandate Vetting</div>
                    {[
                      { name: 'MatureSoft GmbH', status: 'PASS', reason: 'Within revenue band' },
                      { name: 'GrowthPay AG', status: 'PASS', reason: 'EBITDA in range' },
                      { name: 'India Fintech Forum', status: 'Excluded', reason: 'Event, not operating company' },
                    ].map((item, i) => (
                      <motion.div key={item.name} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.15 }} className="bg-white border border-[#dfdcd5] p-3 rounded-[9px] text-[10px]">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-black">{item.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${item.status === 'PASS' ? 'bg-black text-white' : 'bg-[#dfdcd5] text-[#595855]'}`}>{item.status}</span>
                        </div>
                        <div className="text-[#595855]">{item.reason}</div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {activeStep === 4 && (
                  <motion.div key="step4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="w-full h-full pt-8 flex flex-col justify-end">
                    <div className="bg-white border border-[#dfdcd5] rounded-t-[9px] w-full max-w-sm mx-auto p-5 flex flex-col gap-4 shadow-none">
                      <div className="text-[10px] text-[#595855] uppercase tracking-widest">Diligence Shortlist · 5 on thesis</div>
                      <div className="space-y-2">
                        {['MatureSoft GmbH · 94% fit', 'GrowthPay AG · 88% fit'].map((row) => (
                          <div key={row} className="flex justify-between text-[11px] border-b border-[#dfdcd5] pb-1.5">
                            <span>{row.split(' · ')[0]}</span>
                            <span className="font-medium">{row.split(' · ')[1]}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center font-bold text-xs shrink-0 shadow-none">Z</div>
                        <div className="bg-[#e7e5e4] p-3 rounded-[9px] rounded-tl-none text-[11px] text-black leading-relaxed shadow-none">
                          5 companies passed mandate vetting. 2 excluded — one event, one geography mismatch. Ready to export for your deal team.
                        </div>
                      </div>
                      <button 
                        onClick={() => navigate('/chat')}
                        className="mt-2 w-full py-3 bg-black text-white rounded-[28.8px] text-xs font-semibold shadow-none flex items-center justify-center gap-2 hover:opacity-90 transition-colors border-none"
                      >
                        <FileSpreadsheet size={12} /> Export Shortlist CSV
                      </button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>

        </div>
      </section>

      {/* 8. Sourcing Workflow Diagram */}
      <section className="py-24 px-6 bg-[#ebebeb] border-t border-[#dfdcd5]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#595855] block mb-2">At a Glance</span>
            <h2 className="text-3xl md:text-4xl font-davinci font-medium text-[#000000] tracking-tight mb-2">The Sourcing Workflow</h2>
            <p className="text-[#595855] text-xs max-w-md mx-auto">Mandate → research → vet → shortlist. A single workflow from thesis to diligence-ready output.</p>
          </div>
          <div className="h-[480px] border border-[#dfdcd5] rounded-[9px] bg-[#e7e5e4] overflow-hidden shadow-none">
            <ArchitectureDiagram />
          </div>
        </div>
      </section>

      {/* 9. Minimalist Editorial Footer (Chalk Background) */}
      <footer className="bg-[#ebebeb] border-t border-[#dfdcd5] py-24 px-6 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <h3 className="text-3xl md:text-5xl font-davinci font-medium text-[#000000] tracking-tight leading-tight">
            Run a Mandate.<br />Get a Shortlist.
          </h3>
          
          <p className="text-[#595855] text-xs md:text-sm max-w-sm mx-auto leading-relaxed">
            Run PE mandates in natural language. Get a vetted shortlist with financial-band fit, clear exclusion reasons, and export-ready tables for your deal team.
          </p>
          
          <button 
            onClick={() => navigate('/chat')}
            className="inline-flex items-center gap-2 px-[24px] py-[12px] bg-[#000000] text-white rounded-[28.8px] font-helvetica-now text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-none"
          >
            Request a Demo <ArrowRight size={14} />
          </button>

          <div className="pt-20 border-t border-[#dfdcd5] flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-[#595855]">
            <div className="flex items-center gap-2">
              <CircledZMonogram />
              <span className="font-davinci font-bold uppercase tracking-wider">Zoron AI</span>
            </div>
            <div className="flex gap-6 uppercase tracking-widest text-[10px]">
              <a href="#features" className="hover:text-black transition-colors">Overview</a>
              <a href="#product" className="hover:text-black transition-colors">Capabilities</a>
              <a href="#technology" className="hover:text-black transition-colors">How It Works</a>
            </div>
            <span>© 2026 Zoron AI Sourcing.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default Landing;
