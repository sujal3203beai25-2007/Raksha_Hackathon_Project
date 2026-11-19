import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MapPin, Navigation, Route as RouteIcon } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FacilityRecord } from '../shared/types.ts';
import { Button } from './ui/Primitives.tsx';

interface FacilityMapProps {
  facilities: FacilityRecord[];
  origin: { lat: number; lng: number };
  selectedFacility: FacilityRecord | null;
  onSelectFacility: (f: FacilityRecord) => void;
  lowDataMode: boolean;
  isOnline: boolean;
  skipApiProvider?: boolean;
}

interface MapsPolyline {
  setMap: (map: unknown) => void;
  setOptions: (opts: { strokeColor: string; strokeWeight: number }) => void;
}

interface MapsLatLngBounds {
  [key: string]: unknown;
}

interface MapsAdvancedMarkerElement {
  [key: string]: unknown;
}

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

const RouteOverlay: React.FC<{
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number } | null;
  onRouteComputed: (summary: { distanceKm: number; durationMins: number } | null) => void;
}> = ({ origin, destination, onRouteComputed }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<MapsPolyline[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    onRouteComputed(null);

    if (!map || !routesLib || !destination) return;

    let cancelled = false;
    const request = {
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    const RouteClass = routesLib.Route as unknown as {
      computeRoutes: (req: typeof request) => Promise<{
        routes?: Array<{
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: MapsLatLngBounds;
          createPolylines: () => MapsPolyline[];
        }>;
      }>;
    };

    RouteClass.computeRoutes(request)
      .then((resp) => {
        if (cancelled) return;
        const primary = resp.routes?.[0];
        if (!primary) return;
        const lines = primary.createPolylines();
        lines.forEach((line) => {
          line.setOptions({ strokeColor: '#087F8C', strokeWeight: 5 });
          line.setMap(map);
        });
        polylinesRef.current = lines;
        if (primary.viewport && typeof (map as unknown as { fitBounds?: (b: MapsLatLngBounds) => void }).fitBounds === 'function') {
          (map as unknown as { fitBounds: (b: MapsLatLngBounds) => void }).fitBounds(primary.viewport);
        }
        onRouteComputed({
          distanceKm: Number(((primary.distanceMeters ?? 0) / 1000).toFixed(1)),
          durationMins: Math.max(1, Math.round((primary.durationMillis ?? 0) / 60000)),
        });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, origin.lat, origin.lng, destination?.lat, destination?.lng, onRouteComputed]);

  return null;
};

const FacilityMarkerItem: React.FC<{
  facility: FacilityRecord;
  isSelected: boolean;
  infoOpen: boolean;
  onClick: () => void;
  onCloseInfo: () => void;
}> = ({ facility, isSelected, infoOpen, onClick, onCloseInfo }) => {
  const [markerRef, setMarkerRef] = useState<MapsAdvancedMarkerElement | null>(null);
  const handleRef = useCallback((el: unknown) => {
    setMarkerRef((el as MapsAdvancedMarkerElement | null) ?? null);
  }, []);

  return (
    <>
      <AdvancedMarker
        ref={handleRef}
        position={{ lat: facility.lat, lng: facility.lng }}
        onClick={onClick}
        title={facility.name}
      >
        <Pin
          background={isSelected ? '#C81E1E' : facility.emergencyCapable ? '#087F8C' : '#10243A'}
          glyphColor="#FFFFFF"
          borderColor="#FFFFFF"
        />
      </AdvancedMarker>
      {isSelected && infoOpen && markerRef && (
        <InfoWindow anchor={markerRef} onCloseClick={onCloseInfo}>
          <div className="p-1 text-xs text-[#10243A] max-w-[220px]">
            <p className="font-semibold">{facility.name}</p>
            <p className="text-slate-600 mt-0.5">
              {facility.type} · {facility.taluka}, {facility.district}
            </p>
            <p className="text-slate-500 mt-1">Source: {facility.data_source}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export const FacilityMap: React.FC<FacilityMapProps> = ({
  facilities,
  origin,
  selectedFacility,
  onSelectFacility,
  lowDataMode,
  isOnline,
  skipApiProvider = false,
}) => {
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: number; durationMins: number } | null>(null);
  const [closedFacilityId, setClosedFacilityId] = useState<string | null>(null);

  useEffect(() => {
    setClosedFacilityId(null);
  }, [selectedFacility?.facilityId]);

  // Accessible & Low-Data / Unconfigured-Key Fallback View
  if (lowDataMode || !isOnline || !MAPS_API_KEY) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 sm:p-5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-5 w-5 text-[#087F8C] dark:text-[#16B8C5] shrink-0" />
            <h3 className="text-sm font-semibold text-[#10243A] dark:text-slate-100">
              Accessible Coordinate &amp; Distance Corridor View
            </h3>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            Origin: {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
          </span>
        </div>
        <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {lowDataMode
            ? 'Low-Data Mode is active: interactive map tiles are paused to conserve rural mobile bandwidth.'
            : !isOnline
              ? 'Offline Mode: showing cached facility coordinates.'
              : 'Interactive Google Maps tile layer awaits VITE_GOOGLE_MAPS_API_KEY configuration. Full accessible text navigation remains active below.'}
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {facilities.slice(0, 6).map((f) => (
            <button
              key={f.facilityId}
              onClick={() => onSelectFacility(f)}
              className={`min-w-0 text-left rounded-xl border p-3 transition-colors min-h-[48px] cursor-pointer ${
                selectedFacility?.facilityId === f.facilityId
                  ? 'border-[#087F8C] bg-[#087F8C]/5 dark:border-[#16B8C5] dark:bg-[#16B8C5]/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-medium text-[#10243A] dark:text-slate-100 truncate">{f.name}</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                {f.type} · {f.lat.toFixed(3)}, {f.lng.toFixed(3)}
              </div>
            </button>
          ))}
        </div>
        {selectedFacility && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5">
            <div className="text-xs text-slate-700 dark:text-slate-300 min-w-0 break-words">
              Selected: <strong>{selectedFacility.name}</strong> ({selectedFacility.taluka}, {selectedFacility.district})
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${selectedFacility.lat},${selectedFacility.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[44px] shrink-0"
            >
              <Navigation className="h-3.5 w-3.5 shrink-0" />
              Open Turn-by-Turn Navigation
            </a>
          </div>
        )}
      </div>
    );
  }

  const mapContent = (
    <GoogleMap
      defaultCenter={origin}
      center={selectedFacility ? { lat: selectedFacility.lat, lng: selectedFacility.lng } : origin}
      defaultZoom={9}
      mapId="DEMO_MAP_ID"
      gestureHandling="greedy"
      internalUsageAttributionIds={['gmp_git_agentskills_v1']}
      style={{ width: '100%', height: '100%' }}
    >
      <AdvancedMarker position={origin} title="Patient / Search Origin">
        <Pin background="#10243A" glyphColor="#16B8C5" borderColor="#FFFFFF" />
      </AdvancedMarker>

      {facilities.map((fac) => (
        <FacilityMarkerItem
          key={fac.facilityId}
          facility={fac}
          isSelected={selectedFacility?.facilityId === fac.facilityId}
          infoOpen={closedFacilityId !== fac.facilityId}
          onClick={() => {
            setClosedFacilityId(null);
            onSelectFacility(fac);
          }}
          onCloseInfo={() => setClosedFacilityId(fac.facilityId)}
        />
      ))}

      <RouteOverlay
        origin={origin}
        destination={selectedFacility ? { lat: selectedFacility.lat, lng: selectedFacility.lng } : null}
        onRouteComputed={setRouteSummary}
      />
    </GoogleMap>
  );

  return (
    <div className="space-y-3 min-w-0">
      <div className="h-[280px] sm:h-[360px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        {skipApiProvider ? (
          mapContent
        ) : (
          <APIProvider apiKey={MAPS_API_KEY} language="en" region="IN">
            {mapContent}
          </APIProvider>
        )}
      </div>

      {selectedFacility && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-slate-700 dark:text-slate-200 min-w-0">
            <RouteIcon className="h-4 w-4 text-[#087F8C] shrink-0 mt-0.5 sm:mt-0" />
            <span className="min-w-0 break-words">
              <strong>{selectedFacility.name}</strong>
              {routeSummary && (
                <span className="ml-2 font-mono tabular-nums">
                  · {routeSummary.distanceKm} km · ~{routeSummary.durationMins} min drive
                </span>
              )}
            </span>
          </div>
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${selectedFacility.lat},${selectedFacility.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 min-h-[44px] sm:min-h-[40px] text-xs font-medium text-[#10243A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Navigation className="h-3.5 w-3.5 shrink-0" />
            Directions
          </a>
        </div>
      )}
    </div>
  );
};
