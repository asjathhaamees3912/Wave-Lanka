import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";

// Leaflet CSS needs to be loaded, but it's done globally in _app.js.
// We resolve icon issue with L.divIcon to avoid broken default markers.

function MapViewHandler({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom(), { animate: true, duration: 1.0 });
    }
  }, [center, zoom, map]);
  return null;
}

export default function WaveMap({
  zones = [],
  safetyByZoneId = {},
  selectedZoneId = null,
  onSelectZone = null
}) {
  // Center of Sri Lanka
  const defaultCenter = [7.8731, 80.7718];
  const defaultZoom = 7.5;

  const activeZone = zones.find((z) => z.id === selectedZoneId);
  const mapCenter = activeZone ? [activeZone.lat, activeZone.lon] : defaultCenter;
  // If a zone is selected, zoom in slightly; otherwise stay at national level
  const mapZoom = activeZone ? 8.5 : defaultZoom;

  const createDotIcon = (level, isActive) => {
    const colors = {
      SAFE: "#10b981",
      CAUTION: "#fbbf24",
      DANGEROUS: "#f97316",
      "DO NOT GO": "#ef4444",
      DO_NOT_GO: "#ef4444"
    };
    
    const color = colors[level] || "#94a3b8";
    const size = isActive ? 28 : 20;
    
    return L.divIcon({
      className: "custom-map-marker",
      html: `
        <div class="relative flex items-center justify-center" style="width: ${size}px; height: ${size}px;">
          <span class="absolute inline-flex h-full w-full rounded-full animate-ping opacity-60" style="background-color: ${color}; animation-duration: 2s;"></span>
          <span class="relative inline-flex rounded-full h-${isActive ? '4' : '3'} w-${isActive ? '4' : '3'} border-2 border-white shadow-lg" style="background-color: ${color};"></span>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  };

  return (
    <div className="relative w-full h-[400px] md:h-[500px] rounded-2xl overflow-hidden border border-[rgba(56,189,248,0.15)] bg-[var(--bg-ocean-card)] shadow-lg shadow-[#020813]">
      <div className="absolute top-4 left-4 z-[1000] bg-[var(--bg-ocean-card)]/90 backdrop-blur-md border border-[rgba(56,189,248,0.15)] rounded-xl px-4 py-2.5 shadow-md">
        <h4 className="text-xs uppercase font-extrabold tracking-wider text-[var(--primary-cyan)]">Live Coastal Map</h4>
        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Interactive Sri Lanka Sea Zones</p>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        <MapViewHandler center={mapCenter} zoom={mapZoom} />

        {zones.map((zone) => {
          const safety = safetyByZoneId[zone.id];
          const level = safety?.level || "UNKNOWN";
          const isActive = zone.id === selectedZoneId;
          const currentConditions = safety?.current_conditions;

          return (
            <Marker
              key={zone.id}
              position={[zone.lat, zone.lon]}
              icon={createDotIcon(level, isActive)}
              eventHandlers={{
                click: () => {
                  if (onSelectZone) {
                    onSelectZone(zone.id);
                  }
                }
              }}
            >
              <Popup className="custom-leaflet-popup">
                <div className="p-1 text-slate-100 bg-[#0c1a30] rounded-lg">
                  <h5 className="font-bold text-sm text-[var(--text-primary)]">{zone.name}</h5>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-[var(--text-secondary)]">Status:</span>
                    <span className="font-semibold" style={{
                      color: level === 'SAFE' ? '#10b981' : level === 'CAUTION' ? '#fbbf24' : '#ef4444'
                    }}>{level}</span>
                  </div>
                  {currentConditions && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] border-t border-slate-700/50 pt-1.5">
                      <div>
                        <span className="text-slate-400">Wave:</span>{" "}
                        <strong className="text-white">{currentConditions.wave_height ? `${Number(currentConditions.wave_height).toFixed(1)}m` : "—"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Wind:</span>{" "}
                        <strong className="text-white">{currentConditions.wind_speed_10m ? `${Number(currentConditions.wind_speed_10m).toFixed(0)}km/h` : "—"}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[var(--bg-ocean-card)]/95 backdrop-blur-md border border-[rgba(56,189,248,0.15)] rounded-xl p-3 shadow-md flex flex-col gap-1.5 text-[10px]">
        <div className="font-bold text-[var(--text-primary)] border-b border-[rgba(56,189,248,0.1)] pb-1 mb-0.5">Safety Index</div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[var(--text-secondary)]">Safe (Waves &lt; 1.0m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="text-[var(--text-secondary)]">Caution (Waves 1.0m - 2.0m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-orange-400" />
          <span className="text-[var(--text-secondary)]">Dangerous (Waves 2.0m - 3.5m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="text-[var(--text-secondary)]">Do Not Go (Waves &gt; 3.5m)</span>
        </div>
      </div>
    </div>
  );
}
