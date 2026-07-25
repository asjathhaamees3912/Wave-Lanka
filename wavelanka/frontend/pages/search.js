import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import axios from "axios";
import dynamic from "next/dynamic";
import Fuse from "fuse.js";
import BrandLogo from "@/components/BrandLogo";

import { TOWN_LIST, ZONES, getZoneById, getZoneShortName } from "@/lib/zones";
import ThemeToggle from "@/components/ThemeToggle";
import { getSafetyVerdict } from "@/lib/safety";
import Footer from "@/components/Footer";

// Dynamically import ZoneMap to bypass Next.js SSR window check
const ZoneMap = dynamic(() => import("@/components/ZoneMap"), { ssr: false });

const FUSE_OPTIONS = {
  keys: ["key", "displayName"],
  threshold: 0.3,
  includeScore: true,
};

export default function SearchPage() {
  const router = useRouter();
  const [searchText, setSearchText] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [selectedTown, setSelectedTown] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  const [safetyByZoneId, setSafetyByZoneId] = useState({});
  const zoneChipsRef = useRef(null);

  const cleanUrl = (url) => {
    if (!url) return "";
    let cleaned = url.replace(/['"]/g, "").trim();
    if (cleaned && !cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      cleaned = "https://" + cleaned;
    }
    return cleaned;
  };

  const backendBase =
    cleanUrl(process.env.NEXT_PUBLIC_BACKEND_URL) || "http://localhost:5000";

  const fuse = useMemo(() => new Fuse(TOWN_LIST, FUSE_OPTIONS), []);

  // Load safety metadata to color-code map markers (ML-first, fallback to rules)
  useEffect(() => {
    let active = true;
    async function loadSafety() {
      try {
        // Try ML predict for all zones in parallel (best-effort)
        const results = await Promise.allSettled(
          ZONES.map((z) => getSafetyVerdict(z.id))
        );

        if (!active) return;

        const map = {};
        for (let i = 0; i < ZONES.length; i++) {
          const zone = ZONES[i];
          const res = results[i];
          if (res.status === "fulfilled" && res.value) {
            const v = res.value;
            map[zone.id] = {
              zone: { id: zone.id },
              level: v.level || "UNKNOWN",
              reason: v.reason || null,
              current_conditions: v.current_conditions || null,
              source: v.source || (v.raw ? (v.raw.source || "ml") : "ml"),
            };
          }
        }

        // If map is empty (MLs all failed), gracefully fallback to backend bulk endpoint
        if (Object.keys(map).length === 0) {
          try {
            const resp = await axios.get(`${backendBase}/api/safety/all`);
            if (active && resp.data?.success) {
              const items = resp.data.zones || [];
              for (const z of items) {
                if (z?.zone?.id) map[z.zone.id] = z;
              }
            }
          } catch (err) {
            console.error("Failed to load rules fallback safety", err);
          }
        }

        if (active) setSafetyByZoneId(map);
      } catch (err) {
        console.error("Failed to load map safety colors", err);
      }
    }
    loadSafety();
    return () => {
      active = false;
    };
  }, [backendBase]);

  const fuseResults = useMemo(() => {
    const query = searchText.trim();
    if (!query) return [];
    return fuse.search(query);
  }, [searchText, fuse]);

  const suggestions = useMemo(() => {
    return fuseResults.map((result) => result.item);
  }, [fuseResults]);

  const hasNoMatch = searchText.trim().length > 0 && fuseResults.length === 0;

  // Resolve town + zone from fuzzy search input
  useEffect(() => {
    const query = searchText.trim();
    if (!query) {
      setSelectedTown(null);
      return;
    }

    if (fuseResults.length > 0) {
      setSelectedTown(fuseResults[0].item);
      setSelectedZoneId(fuseResults[0].item.zoneId);
    } else {
      setSelectedTown(null);
    }
  }, [searchText, fuseResults]);

  const selectedZone = useMemo(() => {
    return getZoneById(selectedZoneId);
  }, [selectedZoneId]);

  const handleSelectTown = (town) => {
    setSelectedTown(town);
    setSelectedZoneId(town.zoneId);
    setSearchText(town.displayName);
    setIsFocused(false);
  };

  const handleChipClick = (zoneId) => {
    setSelectedZoneId(zoneId);
    setSelectedTown(null);
    setSearchText("");
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchText(val);
    if (!val.trim()) {
      setSelectedZoneId(null);
      setSelectedTown(null);
    }
  };

  const handleNavigateToForecast = () => {
    if (selectedZoneId) {
      router.push(`/forecast?zone=${selectedZoneId}`);
    }
  };

  const scrollToZoneChips = () => {
    zoneChipsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="min-h-screen text-[var(--text)] flex flex-col relative pb-12">
      {/* Background SVG wave decoration */}
      <div className="wave-container opacity-40">
        <div className="wave-swell wave-1" />
        <div className="wave-swell wave-2" />
        <div className="wave-swell wave-3" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:py-10 z-10 flex-1 flex flex-col">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between z-[1011]">
          <Link href="/" className="flex items-center gap-3 group">
            <BrandLogo className="h-10 w-10 transition-all duration-300 group-hover:scale-110 drop-shadow-[0_0_6px_rgba(14,165,233,0.15)] group-hover:drop-shadow-[0_0_12px_rgba(14,165,233,0.35)]" />
            <span className="text-xl font-extrabold tracking-tight text-[var(--text)] transition-all group-hover:text-sky-400" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              WaveLanka
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
          </Link>
          <ThemeToggle />
        </header>


        {/* Dashboard grid */}
        <div className="grid gap-6 md:grid-cols-12 flex-1 items-stretch">
          {/* Left Column: Search Form */}
          <div className="md:col-span-5 flex flex-col justify-between bg-[var(--ocean-glass)] border border-[var(--border-10)] rounded-2xl p-6 backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Find your sea zone
                </h1>
                <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                  Enter your coastal town or district to get live marine safety conditions and wave forecasts.
                </p>
              </div>

              {/* Autocomplete Input */}
              <div className="relative">
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border-10)] bg-[var(--ocean-deep)]/25 focus-within:border-sky-500/30 px-4 py-3.5 transition-all">
                  <span className="text-sm">🔍</span>
                  <input
                    value={searchText}
                    onChange={handleSearchChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                    placeholder="e.g. Trincomalee, Galle, Jaffna, Colombo..."
                    className="w-full bg-transparent text-xs text-[var(--text)] placeholder-[var(--text-muted)]/60 outline-none"
                  />
                  {searchText && (
                    <button 
                      onClick={() => { setSearchText(""); setSelectedZoneId(null); setSelectedTown(null); }}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {isFocused && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-[1010] bg-[var(--ocean-mid)] border border-[var(--border-10)] rounded-xl overflow-hidden shadow-2xl backdrop-blur-lg">
                    {suggestions.slice(0, 8).map((town) => (
                      <button
                        key={town.key}
                        onMouseDown={() => handleSelectTown(town)}
                        className="w-full text-left px-4 py-2.5 text-xs text-[var(--text)] hover:bg-[var(--border-5)] border-b border-[var(--border-5)] last:border-b-0 transition-colors flex items-center justify-between"
                      >
                        <span>{town.displayName}</span>
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                          {getZoneShortName(getZoneById(town.zoneId))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* No-match fallback */}
                {hasNoMatch && (
                  <p className="mt-2 text-[10px] text-amber-400/90 leading-relaxed font-medium">
                    We don&apos;t have that exact location yet — tap your nearest zone below:
                  </p>
                )}

                {/* Manual zone link */}
                <button
                  type="button"
                  onClick={scrollToZoneChips}
                  className="mt-2 text-[10px] text-sky-400/80 hover:text-sky-300 underline underline-offset-2 transition-colors"
                >
                  Don&apos;t see your town? View all zones manually
                </button>
              </div>

              {/* Zone Detection Banner */}
              {selectedTown && selectedZone ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-center gap-2 animate-fade-in">
                  <span className="text-sm">📍</span>
                  <div>
                    <div className="text-xs font-bold text-[var(--text)]">
                      {selectedTown.displayName} → {getZoneShortName(selectedZone)} zone
                    </div>
                    <div className="text-[9px] text-emerald-400/80 mt-0.5 font-medium">
                      Pinned at {selectedTown.lat.toFixed(2)}°N, {selectedTown.lon.toFixed(2)}°E
                    </div>
                  </div>
                </div>
              ) : selectedZone ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-center gap-2 animate-fade-in">
                  <span className="text-emerald-400 text-sm font-bold">✓</span>
                  <div>
                    <div className="text-[9px] font-extrabold uppercase text-emerald-400 tracking-wider">Zone Detected</div>
                    <div className="text-xs font-bold text-[var(--text)] mt-0.5">{selectedZone.name}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border-10)] bg-[var(--text)]/[0.01] p-3.5 text-center text-[10px] text-[var(--text-muted)] font-medium">
                  Waiting for town or zone selection...
                </div>
              )}

              {/* View Forecast Button */}
              <button
                onClick={handleNavigateToForecast}
                disabled={!selectedZoneId}
                className={`w-full rounded-xl py-3.5 text-xs font-bold tracking-wide transition-all shadow-lg flex items-center justify-center gap-1.5 ${
                  selectedZoneId
                    ? "bg-gradient-to-r from-sky-600 to-blue-700 text-white hover:from-sky-500 hover:to-blue-600 cursor-pointer shadow-sky-950/20"
                    : "bg-[var(--border-5)] border border-[var(--border-5)] text-[var(--text)]/20 cursor-not-allowed"
                }`}
              >
                View Live Forecast →
              </button>
            </div>

            {/* Shortcut Chips */}
            <div ref={zoneChipsRef} className="mt-8 border-t border-[var(--border-5)] pt-5 scroll-mt-4">
              <span className="block text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-extrabold mb-3">
                Quick Shortcuts
              </span>
              <div className="flex flex-wrap gap-2">
                {ZONES.map((zone) => {
                  const isActive = zone.id === selectedZoneId;
                  return (
                    <button
                      key={zone.id}
                      onClick={() => handleChipClick(zone.id)}
                      className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold transition-all duration-200 ${
                        hasNoMatch
                          ? "animate-zone-pulse border-sky-400/40 bg-sky-500/10 text-sky-300"
                          : isActive
                          ? "border-sky-400/50 bg-sky-500/10 text-sky-300"
                          : "border-[var(--border-5)] bg-[var(--ocean-deep)]/25 text-[var(--text-muted)] hover:border-[var(--border-15)] hover:text-[var(--text)]"
                      }`}
                    >
                      {zone.name.split(" (")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Leaflet Map */}
          <div className="md:col-span-7 flex flex-col h-[450px] md:h-auto min-h-[400px]">
            <ZoneMap
              zones={ZONES}
              selectedZoneId={selectedZoneId}
              selectedTown={selectedTown}
              onSelectZone={setSelectedZoneId}
              safetyByZoneId={safetyByZoneId}
            />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
