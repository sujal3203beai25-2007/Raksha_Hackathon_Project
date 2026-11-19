import {
  ChevronDown,
  ChevronUp,
  Eye,
  Layers,
  MapPin,
  Pause,
  Play,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  CameraPreset,
  CorridorSceneController,
  LightingPreset,
  mountCorridorScene,
} from '../three/corridorScene.ts';
import { CorridorNodeMeta } from '../three/proceduralModels.ts';
import { Button } from './ui/Primitives.tsx';

function playCorridorChime(tier: string) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = tier === 'DH' ? 587.33 : tier === 'SDH' ? 523.25 : tier === 'ALS' ? 659.25 : 440;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 320);
  } catch {
    // Non-critical synthesized chime
  }
}

export const ThreeSceneView: React.FC = () => {
  const { setActiveSection } = useApp();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<CorridorSceneController | null>(null);

  const [selectedNode, setSelectedNode] = useState<CorridorNodeMeta | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('day');
  const [cutawayAmount, setCutawayAmount] = useState(0);
  const [ambulancePlaying, setAmbulancePlaying] = useState(true);
  const [ambulancePct, setAmbulancePct] = useState(8);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [hudOpen, setHudOpen] = useState(true);
  const audioRef = useRef(audioEnabled);
  audioRef.current = audioEnabled;

  // Isolated Three.js lifecycle (mounts once)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const controller = mountCorridorScene(container, {
      onSelectNode: (node) => {
        setSelectedNode({ ...node });
        if (audioRef.current) {
          playCorridorChime(node.tier);
        }
      },
      onTelemetry: ({ ambulanceProgressPct }) => {
        setAmbulancePct(ambulanceProgressPct);
      },
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Keyboard shortcut 'H' to toggle HUD visibility
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'h' || e.key === 'H') &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        setHudOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCamera = (preset: CameraPreset) => {
    setCameraPreset(preset);
    controllerRef.current?.setCameraPreset(preset);
  };

  const handleLighting = (preset: LightingPreset) => {
    setLightingPreset(preset);
    controllerRef.current?.setLightingPreset(preset);
  };

  const handleCutaway = (val: number) => {
    setCutawayAmount(val);
    controllerRef.current?.setCutawayAmount(val);
  };

  const handleTogglePlay = () => {
    const next = !ambulancePlaying;
    setAmbulancePlaying(next);
    controllerRef.current?.setAmbulancePlaying(next);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#10243A] dark:text-white">
            3D Maharashtra Care Corridor Twin
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Interactive spatial twin of PHC → Sub-District → District Trauma escalation and ALS ambulance transit. Click any facility or ambulance to inspect.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveSection('find_care')}>
          <MapPin className="h-4 w-4 shrink-0" />
          <span>Back to Facility Map</span>
        </Button>
      </div>

      {/* WebGL Viewport Container */}
      <div className="relative h-[540px] sm:h-[620px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#dbeafe]">
        {/* Isolated canvas mount node */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Minimal Top-Left Node Inspection Card (solid bg, zero backdrop-blur) */}
        <div className="absolute top-3 left-3 max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 p-3 text-xs shadow-sm">
          <div className="font-semibold text-[#10243A] dark:text-white">
            {selectedNode ? selectedNode.name : 'PHC → SDH → District Trauma Corridor'}
          </div>
          <div className="mt-0.5 text-[11px] font-medium text-[#087F8C] dark:text-[#16B8C5]">
            {selectedNode
              ? `${selectedNode.tier} · ${selectedNode.subtitle}`
              : `Corridor Transit: ${ambulancePct}% · Drag to orbit, scroll to zoom`}
          </div>
          {selectedNode && (
            <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {selectedNode.capabilitySummary}
            </p>
          )}
        </div>

        {/* Top-Right Compact HUD Toggle + Sound Cue */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAudioEnabled((v) => !v)}
            aria-label={audioEnabled ? 'Mute spatial chimes' : 'Enable spatial chimes'}
            title="Spatial audio cue (synthesized)"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 h-9 w-9 text-[#10243A] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {audioEnabled ? <Volume2 className="h-4 w-4 text-[#087F8C]" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setHudOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 px-2.5 h-9 text-xs font-medium text-[#10243A] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {hudOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            <span>Controls (H)</span>
          </button>
        </div>

        {/* Single Compact Bottom Control Dock (no backdrop-blur, <= 15% height) */}
        {hudOpen && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 p-2.5 shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Camera Presets */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 mr-1">
                <Eye className="h-3.5 w-3.5" /> View:
              </span>
              {(
                [
                  ['overview', 'Corridor'],
                  ['phc', 'PHC'],
                  ['sdh', 'SDH'],
                  ['dh', 'Trauma Hub'],
                  ['ambulance', 'Follow ALS'],
                ] as Array<[CameraPreset, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleCamera(id)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    cameraPreset === id
                      ? 'bg-[#087F8C] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-[#10243A] dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ICU Explode Slider + Ambulance Play/Pause + Lighting */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#10243A] dark:text-slate-200">
                <Layers className="h-3.5 w-3.5 text-[#087F8C]" />
                <span>ICU Layer</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cutawayAmount}
                  onChange={(e) => handleCutaway(Number(e.target.value))}
                  className="w-20 accent-[#087F8C] cursor-pointer"
                />
              </label>

              <button
                type="button"
                onClick={handleTogglePlay}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[#10243A] dark:text-slate-200 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                {ambulancePlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{ambulancePlaying ? 'Pause' : 'Drive'}</span>
              </button>

              <div className="inline-flex items-center gap-1">
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                {(['day', 'dusk', 'night'] as LightingPreset[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleLighting(mode)}
                    className={`px-2 py-1 rounded-lg capitalize font-medium cursor-pointer ${
                      lightingPreset === mode
                        ? 'bg-[#10243A] text-white dark:bg-[#16B8C5] dark:text-[#0B1523]'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
