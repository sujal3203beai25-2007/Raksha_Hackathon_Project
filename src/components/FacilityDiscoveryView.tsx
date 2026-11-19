import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  Accessibility,
  Box,
  Clock,
  Filter,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { logAuditEvent } from '../services/firestoreService.ts';
import { rankFacilities } from '../shared/ambulanceScoring.ts';
import { t } from '../shared/i18n.ts';
import { FacilityRecord, FacilityType } from '../shared/types.ts';
import { FacilityMap } from './FacilityMap.tsx';
import { Button, EmptyState, ModalDialog, SkeletonRows, SurfaceCard } from './ui/Primitives.tsx';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

interface PlacePredictionItem {
  id: string;
  mainText: string;
  secondaryText: string;
  toPlace: () => {
    fetchFields: (opts: { fields: string[] }) => Promise<{
      place: {
        displayName?: string;
        formattedAddress?: string;
        location?: { lat: () => number; lng: () => number };
      };
    }>;
  };
}

const PlacesOriginAutocomplete: React.FC<{
  onOriginSelect: (origin: { lat: number; lng: number; label: string }) => void;
}> = ({ onOriginSelect }) => {
  const placesLib = useMapsLibrary('places');
  const [queryText, setQueryText] = useState('');
  const [predictions, setPredictions] = useState<PlacePredictionItem[]>([]);
  const [open, setOpen] = useState(false);
  const tokenRef = useRef<unknown>(null);

  useEffect(() => {
    if (!placesLib || queryText.trim().length < 2) {
      setPredictions([]);
      return;
    }

    const lib = placesLib as unknown as {
      AutocompleteSessionToken: new () => unknown;
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{
          suggestions?: Array<{
            placePrediction?: {
              placeId: string;
              text?: { toString: () => string };
              mainText?: { toString: () => string };
              secondaryText?: { toString: () => string };
              toPlace: PlacePredictionItem['toPlace'];
            };
          }>;
        }>;
      };
    };

    if (!tokenRef.current) {
      tokenRef.current = new lib.AutocompleteSessionToken();
    }

    const timer = setTimeout(() => {
      lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: queryText.trim(),
        sessionToken: tokenRef.current,
        includedRegionCodes: ['in'],
        locationBias: {
          center: { lat: 19.076, lng: 74.5 },
          radius: 50000,
        },
      })
        .then((res) => {
          const items: PlacePredictionItem[] = (res.suggestions ?? [])
            .map((s) => s.placePrediction)
            .filter((p): p is NonNullable<typeof p> => Boolean(p))
            .map((p) => ({
              id: p.placeId,
              mainText: p.mainText?.toString() || p.text?.toString() || 'Selected Place',
              secondaryText: p.secondaryText?.toString() || '',
              toPlace: p.toPlace.bind(p),
            }));
          setPredictions(items);
          setOpen(items.length > 0);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          setPredictions([]);
        });
    }, 260);

    return () => clearTimeout(timer);
  }, [placesLib, queryText]);

  const handleChoose = async (item: PlacePredictionItem) => {
    try {
      const place = item.toPlace();
      const { place: fetched } = await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      if (fetched.location) {
        const label = fetched.displayName || item.mainText;
        onOriginSelect({
          lat: Number(fetched.location.lat().toFixed(5)),
          lng: Number(fetched.location.lng().toFixed(5)),
          label,
        });
        setQueryText(label);
      }
    } finally {
      tokenRef.current = null; // Reset session token after selection
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={queryText}
        onChange={(e) => setQueryText(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder="Search any village, taluka, or town in Maharashtra..."
        aria-label="Search origin town or village via Places Autocomplete"
        className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
      />
      {open && predictions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-40 divide-y divide-slate-100 dark:divide-slate-800"
        >
          {predictions.map((pred) => (
            <li key={pred.id}>
              <button
                type="button"
                onClick={() => void handleChoose(pred)}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <div className="font-semibold text-[#10243A] dark:text-white truncate">{pred.mainText}</div>
                {pred.secondaryText && (
                  <div className="text-[11px] text-slate-500 truncate">{pred.secondaryText}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const RURAL_ORIGIN_PRESETS: Array<{ label: string; lat: number; lng: number }> = [
  { label: 'Velhe Village, Pune Rural', lat: 18.2947, lng: 73.6353 },
  { label: 'Wadgaon Maval, Pune', lat: 18.7412, lng: 73.6352 },
  { label: 'Baramati Taluka, Pune', lat: 18.1516, lng: 74.5777 },
  { label: 'Karad, Satara', lat: 17.2894, lng: 74.1817 },
  { label: 'Dahanu, Palghar', lat: 19.9693, lng: 72.7315 },
  { label: 'Gadchiroli Rural Hub', lat: 20.1809, lng: 80.0033 },
  { label: 'Nandurbar Tribal Corridor', lat: 21.3702, lng: 74.2409 },
];

export const FacilityDiscoveryView: React.FC<{
  facilities: FacilityRecord[];
  loading: boolean;
  initialRequiredLevel?: FacilityType;
  onStartReferral: (facility: FacilityRecord) => void;
}> = ({ facilities, loading, initialRequiredLevel = 'PHC', onStartReferral }) => {
  const { language, tenantId, user, activeRole, lowDataMode, setActiveSection } = useApp();
  const isOnline = useOnlineStatus();
  const copy = t(language);

  const [searchText, setSearchText] = useState('');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | FacilityType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'public' | 'private' | 'trust'>('ALL');
  const [requiredLevel, setRequiredLevel] = useState<FacilityType>(initialRequiredLevel);
  const [onlyEmergency, setOnlyEmergency] = useState(false);
  const [only24x7, setOnly24x7] = useState(false);
  const [onlyAccessible, setOnlyAccessible] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'list' | 'map'>('split');

  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string }>({
    ...RURAL_ORIGIN_PRESETS[0],
  });
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<FacilityRecord | null>(null);

  const [overrideTarget, setOverrideTarget] = useState<FacilityRecord | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideNotice, setOverrideNotice] = useState<string | null>(null);

  const districts = useMemo(() => {
    const set = new Set(facilities.map((f) => f.district));
    return ['ALL', ...Array.from(set).sort()];
  }, [facilities]);

  const ranked = useMemo(() => {
    const filtered = facilities.filter((f) => {
      if (districtFilter !== 'ALL' && f.district !== districtFilter) return false;
      if (typeFilter !== 'ALL' && f.type !== typeFilter) return false;
      if (categoryFilter !== 'ALL' && f.category !== categoryFilter) return false;
      if (onlyEmergency && !f.emergencyCapable) return false;
      if (only24x7 && !f.hours24x7) return false;
      if (onlyAccessible && !f.wheelchairAccessible) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const hay = `${f.name} ${f.nameHi || ''} ${f.nameMr || ''} ${f.taluka} ${f.district} ${(f.specialties || []).join(' ')} ${(f.diagnostics || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return rankFacilities(filtered, origin, requiredLevel, onlyEmergency);
  }, [
    facilities,
    districtFilter,
    typeFilter,
    categoryFilter,
    onlyEmergency,
    only24x7,
    onlyAccessible,
    searchText,
    origin,
    requiredLevel,
  ]);

  const handleUseDeviceGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Device GPS is not supported in this browser. Choose a village preset instead.');
      return;
    }
    setGpsStatus('Requesting location permission...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          label: 'Device GPS Location',
        });
        setGpsStatus('Location updated from device GPS.');
      },
      () => {
        setGpsStatus('Location permission denied or unavailable. Use manual taluka/village selection below.');
      },
      { enableHighAccuracy: false, timeout: 7000 }
    );
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget || overrideReason.trim().length < 5) return;
    if (user) {
      try {
        await logAuditEvent({
          tenantId,
          actorUid: user.uid,
          actorRole: activeRole,
          action: 'FACILITY_RANKING_OVERRIDE',
          resourceType: 'facility',
          resourceId: overrideTarget.facilityId,
          reason: overrideReason.trim(),
        });
      } catch {
        // Non-blocking audit fallback notice
      }
    }
    setSelectedFacility(overrideTarget);
    setOverrideNotice(`Manual override recorded for ${overrideTarget.name} (Reason: ${overrideReason.trim()}).`);
    setOverrideTarget(null);
    setOverrideReason('');
  };

  const canOverride =
    activeRole === 'clinician' ||
    activeRole === 'dispatcher' ||
    activeRole === 'hospital_coordinator' ||
    activeRole === 'frontline_worker' ||
    activeRole === 'platform_admin' ||
    tenantId === 'demo-maharashtra';

  const getLocalizedName = (f: FacilityRecord) => {
    if (language === 'hi' && f.nameHi) return f.nameHi;
    if (language === 'mr' && f.nameMr) return f.nameMr;
    return f.name;
  };

  const content = (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#10243A] dark:text-white">{copy.actionFindCare}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Public healthcare directory across Maharashtra with explainable distance/capability ranking and explicit capacity provenance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          <Button variant="outline" size="sm" onClick={() => setActiveSection('network_3d')}>
            <Box className="h-4 w-4 shrink-0" />
            <span>3D Corridor Twin</span>
          </Button>

          {/* Clean Segmented View Switcher */}
          <div
            role="group"
            aria-label="Facility display layout"
            className="inline-flex items-center rounded-xl bg-slate-200/75 dark:bg-slate-800 p-1 shrink-0"
          >
            <button
              onClick={() => setViewMode('split')}
              className={`hidden lg:inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-white dark:bg-slate-900 text-[#10243A] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 min-h-[38px] lg:min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-[#10243A] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <List className="h-4 w-4 shrink-0" />
              <span>Text List</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`inline-flex items-center gap-1.5 min-h-[38px] lg:min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-white dark:bg-slate-900 text-[#10243A] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <MapIcon className="h-4 w-4 shrink-0" />
              <span>Map View</span>
            </button>
          </div>
        </div>
      </div>

      {/* Location & Filter Controls */}
      <SurfaceCard className="space-y-4">
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 items-end">
          <div className="sm:col-span-2 lg:col-span-4 min-w-0">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Search facility, taluka, specialty, or diagnostic
            </label>
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="e.g. CT Scan, Maternal, Gadchiroli"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-4 min-w-0">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Patient / Search Origin (GPS or Village Preset)
            </label>
            <div className="flex gap-2 min-w-0">
              <select
                value={origin.label}
                onChange={(e) => {
                  const found = RURAL_ORIGIN_PRESETS.find((p) => p.label === e.target.value);
                  if (found) setOrigin(found);
                }}
                aria-label="Select patient origin preset"
                className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                {!RURAL_ORIGIN_PRESETS.some((p) => p.label === origin.label) && (
                  <option value={origin.label}>{origin.label}</option>
                )}
                {RURAL_ORIGIN_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="md" onClick={handleUseDeviceGps} className="shrink-0">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>GPS</span>
              </Button>
            </div>
            {!lowDataMode && isOnline && MAPS_API_KEY && (
              <div className="mt-2">
                <PlacesOriginAutocomplete onOriginSelect={(next) => setOrigin(next)} />
              </div>
            )}
          </div>

          <div className="lg:col-span-2 min-w-0">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Target Care Level
            </label>
            <select
              value={requiredLevel}
              onChange={(e) => setRequiredLevel(e.target.value as FacilityType)}
              className="w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            >
              <option value="PHC">PHC (Primary)</option>
              <option value="RH">RH (Rural Hosp.)</option>
              <option value="SDH">SDH (Sub-District)</option>
              <option value="DH">DH (District Hosp.)</option>
              <option value="MC">MC (Medical College)</option>
            </select>
          </div>

          <div className="lg:col-span-2 min-w-0">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              District
            </label>
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            >
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All Districts' : d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
            <Filter className="h-3.5 w-3.5 shrink-0" /> Filters:
          </span>
          <select
            aria-label="Facility type filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | FacilityType)}
            className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3"
          >
            <option value="ALL">All Types</option>
            <option value="PHC">PHC</option>
            <option value="RH">RH</option>
            <option value="SDH">SDH</option>
            <option value="DH">DH</option>
            <option value="MC">Medical College</option>
            <option value="PRIVATE">Private / Trust</option>
          </select>

          <select
            aria-label="Ownership category filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | 'public' | 'private' | 'trust')}
            className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3"
          >
            <option value="ALL">Public &amp; Trust</option>
            <option value="public">Public Govt</option>
            <option value="trust">Charitable Trust</option>
            <option value="private">Private</option>
          </select>

          <label className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-[38px] px-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyEmergency}
              onChange={(e) => setOnlyEmergency(e.target.checked)}
              className="h-4 w-4 accent-[#087F8C]"
            />
            <span>Emergency Capable</span>
          </label>

          <label className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-[38px] px-2 cursor-pointer">
            <input
              type="checkbox"
              checked={only24x7}
              onChange={(e) => setOnly24x7(e.target.checked)}
              className="h-4 w-4 accent-[#087F8C]"
            />
            <span>24×7 Open</span>
          </label>

          <label className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-[38px] px-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAccessible}
              onChange={(e) => setOnlyAccessible(e.target.checked)}
              className="h-4 w-4 accent-[#087F8C]"
            />
            <span className="inline-flex items-center gap-1">
              <Accessibility className="h-3.5 w-3.5 shrink-0" /> Wheelchair Accessible
            </span>
          </label>
        </div>

        {gpsStatus && <p className="text-xs text-[#087F8C] dark:text-[#16B8C5]">{gpsStatus}</p>}
        {overrideNotice && (
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
            {overrideNotice}
          </div>
        )}
      </SurfaceCard>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : ranked.length === 0 ? (
        <EmptyState
          title="No facilities matched these filters"
          description="Try clearing specialty or accessibility filters, or switch to All Districts to view Maharashtra reference centres."
          actionLabel="Reset Filters"
          onAction={() => {
            setSearchText('');
            setDistrictFilter('ALL');
            setTypeFilter('ALL');
            setCategoryFilter('ALL');
            setOnlyEmergency(false);
            setOnly24x7(false);
            setOnlyAccessible(false);
          }}
        />
      ) : (
        <div className={viewMode === 'split' ? 'grid gap-6 lg:grid-cols-12 items-start' : 'space-y-6'}>
          {viewMode !== 'map' && (
            <div className={viewMode === 'split' ? 'lg:col-span-7 space-y-4 min-w-0' : 'space-y-4 min-w-0'}>
              {ranked.map((item, idx) => {
                const f = item.facility;
                const isSelected = selectedFacility?.facilityId === f.facilityId;
                const capacityKnown =
                  !item.isStale &&
                  (typeof f.icuBedsAvailable === 'number' || typeof f.generalBedsAvailable === 'number');

                return (
                  <SurfaceCard
                    key={f.facilityId}
                    className={
                      isSelected
                        ? 'border-[#087F8C] dark:border-[#16B8C5] ring-1 ring-[#087F8C]/30'
                        : undefined
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Rank #{idx + 1} · {f.type} · {f.category.toUpperCase()} · {f.taluka}, {f.district}
                        </div>
                        <h3 className="mt-1 text-lg font-bold text-[#10243A] dark:text-white leading-snug break-words">
                          {getLocalizedName(f)}
                        </h3>
                        {f.address && (
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{f.address}</p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base font-bold font-mono tabular-nums text-[#087F8C] dark:text-[#16B8C5]">
                          {item.distanceKm.toFixed(1)} km
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500">
                          ~{item.estimatedDriveMinutes} min est.
                        </div>
                      </div>
                    </div>

                    {/* Transparent Capacity & Provenance Strip (hairline divider, no nested card box) */}
                    <div className="mt-4 py-3 border-t border-b border-slate-200 dark:border-slate-800 grid gap-3 sm:grid-cols-3 text-xs">
                      <div className="min-w-0">
                        <div className="text-slate-500 dark:text-slate-400">ICU / General Beds</div>
                        <div className="mt-0.5 font-semibold font-mono tabular-nums text-[#10243A] dark:text-slate-100">
                          {capacityKnown
                            ? `${f.icuBedsAvailable ?? 'Unknown'} ICU · ${f.generalBedsAvailable ?? 'Unknown'} Gen`
                            : copy.unknownCapacity}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-500 dark:text-slate-400">Oxygen Status</div>
                        <div className="mt-0.5 font-semibold text-[#10243A] dark:text-slate-100">
                          {!item.isStale && f.oxygenAvailable && f.oxygenAvailable !== 'unknown'
                            ? f.oxygenAvailable.replace(/_/g, ' ')
                            : copy.unknownCapacity}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-500 dark:text-slate-400">Data Provenance</div>
                        <div className="mt-0.5 font-medium text-slate-700 dark:text-slate-300 break-words">
                          {f.verification_status.replace(/_/g, ' ')} · {f.data_source}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        Updated: {new Date(f.source_timestamp).toLocaleString()} (TTL {Math.round(f.freshness_ttl / 60)}m)
                      </span>
                      {f.hours24x7 && <span>· 24×7 Operations</span>}
                      {f.emergencyCapable && <span>· Emergency Capable</span>}
                      {f.wheelchairAccessible && <span>· Wheelchair Accessible</span>}
                    </div>

                    {f.specialties && f.specialties.length > 0 && (
                      <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        <strong>Services:</strong> {f.specialties.join(' · ')}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      <strong>Ranking rationale (Score {item.score}):</strong> {item.reasons.join(' · ')}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => onStartReferral(f)}>
                        Start Referral Here
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedFacility(f)}>
                        Focus on Map
                      </Button>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${f.lat},${f.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 min-h-[44px] sm:min-h-[40px] text-xs font-medium text-[#10243A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Navigation className="h-3.5 w-3.5 shrink-0" />
                        Directions
                      </a>
                      {f.phone && (
                        <a
                          href={`tel:${f.phone.replace(/[^+\d]/g, '')}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 min-h-[44px] sm:min-h-[40px] text-xs font-medium text-[#10243A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                          {f.phone}
                        </a>
                      )}
                      {canOverride && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOverrideTarget(f)}
                        >
                          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                          Clinician Override
                        </Button>
                      )}
                    </div>
                  </SurfaceCard>
                );
              })}
            </div>
          )}

          {viewMode !== 'list' && (
            <div className={viewMode === 'split' ? 'lg:col-span-5 lg:sticky lg:top-6 min-w-0' : 'min-w-0'}>
              <FacilityMap
                facilities={ranked.map((r) => r.facility)}
                origin={origin}
                selectedFacility={selectedFacility ?? ranked[0]?.facility ?? null}
                onSelectFacility={setSelectedFacility}
                lowDataMode={lowDataMode}
                isOnline={isOnline}
                skipApiProvider={!lowDataMode && isOnline && Boolean(MAPS_API_KEY)}
              />
            </div>
          )}
        </div>
      )}

      <ModalDialog
        open={Boolean(overrideTarget)}
        onOpenChange={(open) => !open && setOverrideTarget(null)}
        title="Record Clinical / Dispatch Ranking Override"
        description="Overrides must specify a documented operational or clinical justification for the immutable audit trail."
      >
        {overrideTarget && (
          <form onSubmit={handleOverrideSubmit} className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-sm">
              Selected destination: <strong>{overrideTarget.name}</strong>
            </div>
            <label className="block text-sm">
              <span className="font-medium text-[#10243A] dark:text-slate-200">
                Override Reason (required, min 5 chars)
              </span>
              <textarea
                required
                minLength={5}
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Verified obstetric surgeon on duty via telephone handover despite cached status."
                className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOverrideTarget(null)}>
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={overrideReason.trim().length < 5}>
                Confirm Audit Override
              </Button>
            </div>
          </form>
        )}
      </ModalDialog>

      <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        <ShieldAlert className="h-4 w-4 text-[#087F8C] shrink-0 mt-0.5" />
        <span>
          Truthfulness policy: Facilities without a fresh staff capacity report inside their freshness TTL display{' '}
          <strong>{copy.unknownCapacity}</strong>. Confirm bed readiness with the receiving coordinator or call 108 / 112 in emergencies.
        </span>
      </div>
    </div>
  );

  if (!lowDataMode && isOnline && MAPS_API_KEY) {
    return (
      <APIProvider apiKey={MAPS_API_KEY} language="en" region="IN">
        {content}
      </APIProvider>
    );
  }
  return content;
};
