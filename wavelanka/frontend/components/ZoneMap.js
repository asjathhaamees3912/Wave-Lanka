import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";

function MapViewHandler({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 8.5, { animate: true, duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

export default function ZoneMap({
  zones = [],
  selectedZoneId = null,
  selectedTown = null,
  onSelectZone = null,
  safetyByZoneId = {}
}) {
  const sriLankaCenter = [8.0, 80.7];
  const defaultZoom = 7;

  const activeZone = zones.find((z) => z.id === selectedZoneId);
  const mapCenter = selectedTown
    ? [selectedTown.lat, selectedTown.lon]
    : activeZone
    ? [activeZone.lat, activeZone.lon]
    : sriLankaCenter;
  const mapZoom = selectedTown ? 10 : activeZone ? 8.5 : defaultZoom;

  const createDotIcon = (zoneId, isActive) => {
    const safety = safetyByZoneId[zoneId];
    const level = safety?.level || "UNKNOWN";
    
    // Exact colors from spec
    const colors = {
      SAFE: "#22d96b",
      CAUTION: "#f5c542",
      DANGEROUS: "#f97316",
      "DO NOT GO OUT": "#ef4444",
      "DO NOT GO": "#ef4444",
      UNKNOWN: "#89CFF0"
    };

    const color = colors[level] || colors.UNKNOWN;
    const size = isActive ? 28 : 16;
    const innerSize = isActive ? "h-4 w-4" : "h-2 w-2";
    const pingOpacity = isActive ? "opacity-75" : "opacity-0";
    
    return L.divIcon({
      className: "custom-leaflet-marker",
      html: `
        <div class="relative flex items-center justify-center" style="width: ${size}px; height: ${size}px;">
          <span class="absolute inline-flex h-full w-full rounded-full animate-ping ${pingOpacity}" style="background-color: ${color};"></span>
          <span class="relative inline-flex rounded-full ${innerSize} border border-white/60 shadow-lg shadow-black/50" style="background-color: ${color};"></span>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  };

  return (
    <div className="relative w-full h-[400px] md:h-full min-h-[400px] rounded-2xl overflow-hidden border border-white/10 bg-[var(--ocean-card)] shadow-2xl">
      <div
        className="absolute top-4 left-4 z-[1000] rounded-xl px-3 py-2 shadow-xl backdrop-blur-sm"
        style={{ background: 'var(--chat-header-bg)', border: '1px solid var(--chat-border)' }}
      >
        <h4 className="text-[10px] uppercase font-black tracking-widest" style={{ color: 'var(--text-primary)' }}>Safety Index Map</h4>
        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Click markers to inspect sea conditions</p>
      </div>

      <MapContainer
        center={sriLankaCenter}
        zoom={defaultZoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="osm-tile-layer"
        />

        <MapViewHandler center={mapCenter} zoom={mapZoom} />

        {zones.map((zone) => {
          const isActive = zone.id === selectedZoneId && !selectedTown;
          const safety = safetyByZoneId[zone.id];
          const level = safety?.level || "LIVE DATA";

          return (
            <Marker
              key={zone.id}
              position={[zone.lat, zone.lon]}
              icon={createDotIcon(zone.id, isActive)}
              eventHandlers={{
                click: () => {
                  if (onSelectZone) {
                    onSelectZone(zone.id);
                  }
                }
              }}
            >
              <Popup>
                <div className="p-0.5 font-sans">
                  <h5 className="font-extrabold text-sm text-[var(--text)]">{zone.name}</h5>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{zone.region}</p>
                  <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-4">
                    <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Safety:</span>
                    <span 
                      className="text-[10px] font-black uppercase tracking-wider"
                      style={{
                        color: level === "SAFE" ? "#22d96b" : level === "CAUTION" ? "#f5c542" : level === "DANGEROUS" ? "#f97316" : level === "DO NOT GO OUT" ? "#ef4444" : "#89CFF0"
                      }}
                    >
                      {level}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {selectedTown && (
          <Marker
            key={`town-${selectedTown.key}`}
            position={[selectedTown.lat, selectedTown.lon]}
            icon={L.divIcon({
              className: "custom-leaflet-marker",
              html: `
                <div class="relative flex flex-col items-center" style="width: 32px; height: 40px;">
                  <span class="absolute inline-flex h-8 w-8 rounded-full animate-ping opacity-60" style="background-color: #38bdf8; top: 0;"></span>
                  <span class="relative text-2xl leading-none drop-shadow-lg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">📍</span>
                </div>
              `,
              iconSize: [32, 40],
              iconAnchor: [16, 36]
            })}
          >
            <Popup>
              <div className="p-0.5 font-sans">
                <h5 className="font-extrabold text-sm text-[var(--text)]">{selectedTown.displayName}</h5>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {selectedTown.lat.toFixed(4)}°N, {selectedTown.lon.toFixed(4)}°E
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Map Legend */}
      <div
        className="absolute bottom-4 left-4 z-[1000] rounded-lg p-2 shadow-lg backdrop-blur-sm flex flex-col gap-1"
        style={{
          background: 'var(--chat-header-bg)',
          border: '1px solid var(--chat-border)',
          minWidth: 160,
          maxWidth: 220
        }}
      >
        <div className="uppercase tracking-wider pb-1 mb-0.5 text-[9px] font-semibold" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          Index Legend
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#22d96b', boxShadow: '0 0 6px #22d96b' }} />
          <span style={{ color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600 }}>Safe (Waves &lt; 1.0m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#f5c542', boxShadow: '0 0 6px #f5c542' }} />
          <span style={{ color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600 }}>Caution (Waves 1.0-2.0m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#f97316', boxShadow: '0 0 6px #f97316' }} />
          <span style={{ color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600 }}>Dangerous (Waves 2.0-3.5m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
          <span style={{ color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600 }}>Do Not Go Out (Waves &gt; 3.5m)</span>
        </div>
      </div>
    </div>
  );
}
