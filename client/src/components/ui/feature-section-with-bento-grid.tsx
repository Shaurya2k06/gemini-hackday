import React, { useState } from "react";
import { User, Sparkles, TrendingUp, Search, FileSpreadsheet, ChevronDown, ChevronUp, ArrowRight, CheckCircle, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

function Feature() {
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);

  // Sample startup ranking animation values
  const [startups] = useState([
    { id: 1, name: 'MatureSoft GmbH', score: 94, status: 'On thesis' },
    { id: 2, name: 'GrowthPay AG', score: 88, status: 'On thesis' },
    { id: 3, name: 'LedgerFlow', score: 72, status: 'Excluded' },
  ]);

  return (
    <div className="w-full py-12 lg:py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-col gap-10">
          
          {/* Section Header */}
          <div className="flex gap-4 flex-col items-center text-center">
            <div>
              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 px-3 py-1 text-xs font-semibold tracking-wider uppercase rounded-full">
                Zoron AI Platform
              </Badge>
            </div>
            <div className="flex gap-2 flex-col max-w-2xl">
              <h2 className="text-3xl md:text-5xl font-davinci font-medium tracking-tight text-foreground">
                Criteria-Driven Target Screening
              </h2>
              <p className="text-sm md:text-base text-muted-foreground font-normal leading-relaxed">
                Describe your investment thesis in plain English. Zoron researches the market, vets target companies against financial bands, and builds ranked shortlists.
              </p>
            </div>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Tile 1: Zoron AI Landing Page Crunched (lg:col-span-2) */}
            <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2 flex flex-col justify-between transition-all duration-300 hover:shadow-md min-h-[420px] relative overflow-hidden group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                    <Sparkles className="w-6 h-6 stroke-1.5" />
                  </div>
                  <Badge variant="default" className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5">
                    Core Platform
                  </Badge>
                </div>
                
                <div className="flex flex-col gap-2">
                  <h3 className="text-2xl font-davinci font-medium text-foreground tracking-tight">
                    Zoron AI PE Sourcing
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                    Our AI-driven engine translates your investment criteria into an active target screening campaign. By scanning the web and matching targets against criteria, Zoron surfaces proprietary, on-thesis deal flow.
                  </p>
                </div>

                {/* Collapsible "Know More" Area */}
                <AnimatePresence initial={false}>
                  {showMore && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden mt-6 border-t border-border/60 pt-6"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">How it Works</h4>
                          <ul className="space-y-2 text-xs text-muted-foreground">
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <span><strong>Define thesis:</strong> Input sector, region, and financial bands in natural language.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <span><strong>Market Scan:</strong> Automated research checks company databases, press files, and sites.</span>
                            </li>
                          </ul>
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Key Capabilities</h4>
                          <ul className="space-y-2 text-xs text-muted-foreground">
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <span><strong>Vetting Filters:</strong> Automatic exclusion of off-thesis companies or events.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <span><strong>Diligence Export:</strong> Downloader for structured shortlists in CSV or PDF.</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-8 pt-4 border-t border-border/40">
                <button
                  onClick={() => navigate("/chat")}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-xs font-medium hover:opacity-90 transition-all cursor-pointer shadow-sm"
                >
                  Start Screening Chat
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowMore(!showMore)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-border text-muted-foreground hover:text-foreground rounded-full text-xs font-medium transition-colors cursor-pointer"
                >
                  {showMore ? "Show Less" : "Know More"}
                  {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Tile 2: Revenue & EBITDA Bands */}
            <div className="bg-card border border-border rounded-xl p-6 aspect-square md:aspect-auto lg:aspect-square flex justify-between flex-col transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                  <TrendingUp className="w-6 h-6 stroke-1.5" />
                </div>
                <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                  Filters
                </Badge>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <h3 className="text-lg font-davinci font-medium text-foreground tracking-tight">Financial Bands</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Size your target profile with custom revenue or EBITDA thresholds. Zoron automatically extracts target criteria and filters out candidates that don't match your ranges.
                </p>
                <div className="mt-4 bg-muted/50 rounded-lg p-3 border border-border/50 text-[10px] text-muted-foreground space-y-1">
                  <div className="flex justify-between border-b border-border/30 pb-1 font-medium">
                    <span>Threshold</span>
                    <span>Target Range</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span>Revenue</span>
                    <span className="text-foreground font-medium">$15M – $40M</span>
                  </div>
                  <div className="flex justify-between">
                    <span>EBITDA</span>
                    <span className="text-foreground font-medium">$3M – $8M</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tile 3: Live Market Intel */}
            <div className="bg-card border border-border rounded-xl p-6 aspect-square md:aspect-auto lg:aspect-square flex justify-between flex-col transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                  <Search className="w-6 h-6 stroke-1.5" />
                </div>
                <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                  Vetting
                </Badge>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <h3 className="text-lg font-davinci font-medium text-foreground tracking-tight">Live Web Scans</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  New screening profiles trigger fresh searches. Zoron scans company websites, press filings, and databases, verifying active domain status and identifying key operations.
                </p>
                <div className="mt-3 flex items-center gap-2 bg-muted/40 rounded-lg p-2 border border-border/40">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">Live scanning sources…</span>
                </div>
              </div>
            </div>

            {/* Tile 4: Ranked Shortlists (lg:col-span-2) */}
            <div className="bg-card border border-border rounded-xl p-6 lg:col-span-2 flex justify-between flex-col transition-all duration-300 hover:shadow-md min-h-[260px] md:min-h-0">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                  <FileSpreadsheet className="w-6 h-6 stroke-1.5" />
                </div>
                <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                  Output
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-davinci font-medium text-foreground tracking-tight">Ranked Thesis Shortlists</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    View matching scores and clear explanations for included or excluded companies. Export structured shortlists with one click for further diligence.
                  </p>
                </div>
                
                {/* Micro preview of Ranked Startups */}
                <div className="bg-muted/30 border border-border/80 rounded-xl p-3 space-y-1.5 shadow-inner">
                  <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Thesis Candidates</div>
                  {startups.map((startup) => (
                    <div key={startup.id} className="bg-card border border-border rounded-lg px-2.5 py-1.5 flex justify-between items-center text-[10px]">
                      <span className="font-medium text-foreground">{startup.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] px-1 py-0.2 rounded font-medium ${startup.status === 'On thesis' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {startup.status}
                        </span>
                        <span className="font-semibold">{startup.score}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export { Feature };
