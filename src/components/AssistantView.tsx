import {
  AlertTriangle,
  ExternalLink,
  Globe,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  PhoneCall,
  Plus,
  Radio,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { AudioRecorderHandle, isAudioRecordingSupported, startAudioClipRecording } from '../lib/audioTranscribe.ts';
import {
  appendAiMessage,
  createAiSession,
  deleteAiSession,
  subscribeAiMessages,
  subscribeAiSessions,
  updateAiSessionMeta,
} from '../services/firestoreService.ts';
import {
  AiCitation,
  AiGroundingMode,
  AiMessageRecord,
  AiModelMode,
  AiPersona,
  AiSessionRecord,
} from '../shared/types.ts';
import { Button, SurfaceCard } from './ui/Primitives.tsx';

interface LocalTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  thinkingLevel?: string;
  groundingMode?: AiGroundingMode;
  citations?: AiCitation[];
}

function renderSafeMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        const formatInline = (segment: string) => {
          const parts = segment.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
          return parts.map((p, i) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return <strong key={i}>{p.slice(2, -2)}</strong>;
            }
            if (p.startsWith('`') && p.endsWith('`')) {
              return (
                <code
                  key={i}
                  className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-xs font-mono"
                >
                  {p.slice(1, -1)}
                </code>
              );
            }
            return p;
          });
        };

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="font-bold text-[#10243A] dark:text-white pt-1">
              {formatInline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          return (
            <h3 key={idx} className="font-bold text-base text-[#10243A] dark:text-white pt-1">
              {formatInline(trimmed.replace(/^#+\s*/, ''))}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-[#087F8C] dark:text-[#16B8C5] font-bold">•</span>
              <span className="flex-1">{formatInline(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{formatInline(trimmed)}</p>;
      })}
    </div>
  );
}

// Base64 / PCM helpers for Gemini Live API (16kHz upload -> 24kHz gapless playback)
function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < out.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i += 1) {
      accum += input[i];
      count += 1;
    }
    const sample = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return out;
}

export const AssistantView: React.FC = () => {
  const { user, language, signInWithGoogle } = useApp();
  const [activeTab, setActiveTab] = useState<'chat' | 'live'>('chat');

  // --- Chat State ---
  const [sessions, setSessions] = useState<AiSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [firestoreMessages, setFirestoreMessages] = useState<AiMessageRecord[]>([]);
  const [guestMessages, setGuestMessages] = useState<LocalTurn[]>([]);
  const [modelMode, setModelMode] = useState<AiModelMode>('balanced');
  const [groundingMode, setGroundingMode] = useState<AiGroundingMode>('none');
  const [persona, setPersona] = useState<AiPersona>('navigator');
  const [usePuneLatLng, setUsePuneLatLng] = useState(true);
  const [promptInput, setPromptInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Audio clip dictation via gemini-3.5-transcribe
  const [recordingClip, setRecordingClip] = useState(false);
  const [transcribingClip, setTranscribingClip] = useState(false);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // --- Live Voice State (gemini-3.8-live) ---
  const [liveStatus, setLiveStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'closing' | 'error'
  >('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<
    Array<{ id: string; speaker: 'user' | 'assistant'; text: string }>
  >([]);
  const liveWsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const liveConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveCancelledRef = useRef<boolean>(false);

  // Subscribe to Firestore sessions when signed in
  useEffect(() => {
    const unsub = subscribeAiSessions(user?.uid ?? null, (rows) => {
      setSessions(rows);
      if (rows.length > 0 && !activeSessionId) {
        setActiveSessionId(rows[0].sessionId);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    const unsub = subscribeAiMessages(user?.uid ?? null, activeSessionId, setFirestoreMessages);
    return () => unsub();
  }, [user?.uid, activeSessionId]);

  const displayedMessages: LocalTurn[] = user
    ? firestoreMessages.map((m) => ({
        id: m.messageId,
        role: m.role,
        text: m.text,
        model: m.model,
        thinkingLevel: m.thinkingLevel,
        groundingMode: m.groundingMode,
        citations: m.citations,
      }))
    : guestMessages;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayedMessages.length, chatSending]);

  const handleNewSession = async () => {
    setChatError(null);
    if (!user) {
      setGuestMessages([]);
      return;
    }
    const id = await createAiSession({
      uid: user.uid,
      title: 'New Healthcare Navigation Chat',
      modelMode,
      groundingMode,
      persona,
    });
    setActiveSessionId(id);
  };

  const handleToggleDictation = async () => {
    if (recordingClip) {
      setRecordingClip(false);
      setTranscribingClip(true);
      try {
        const res = await recorderRef.current?.stopAndTranscribe();
        if (res?.transcript) {
          setPromptInput((prev) => (prev ? `${prev} ${res.transcript}` : res.transcript));
        }
      } catch (err) {
        setChatError(err instanceof Error ? err.message : 'Could not transcribe voice clip.');
      } finally {
        recorderRef.current = null;
        setTranscribingClip(false);
      }
      return;
    }
    setChatError(null);
    try {
      const handle = await startAudioClipRecording(language);
      recorderRef.current = handle;
      setRecordingClip(true);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Microphone access unavailable.');
    }
  };

  const sendMessageText = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || chatSending) return;
    setChatError(null);
    setChatSending(true);
    setPromptInput('');

    let targetSessionId = activeSessionId;
    try {
      if (user) {
        if (!targetSessionId) {
          targetSessionId = await createAiSession({
            uid: user.uid,
            title: trimmed.slice(0, 64),
            modelMode,
            groundingMode,
            persona,
          });
          setActiveSessionId(targetSessionId);
        } else {
          const currentMeta = sessions.find((s) => s.sessionId === targetSessionId);
          await updateAiSessionMeta({
            uid: user.uid,
            sessionId: targetSessionId,
            title:
              currentMeta && currentMeta.title !== 'New Healthcare Navigation Chat'
                ? currentMeta.title
                : trimmed.slice(0, 64),
            modelMode,
            groundingMode,
            persona,
          });
        }
        await appendAiMessage({
          uid: user.uid,
          sessionId: targetSessionId,
          role: 'user',
          text: trimmed,
        });
      } else {
        setGuestMessages((prev) => [
          ...prev,
          { id: `u-${Date.now()}`, role: 'user', text: trimmed },
        ]);
      }

      const historyPayload = [
        ...displayedMessages.slice(-16).map((m) => ({ role: m.role, text: m.text })),
        { role: 'user' as const, text: trimmed },
      ];

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyPayload,
          modelMode,
          grounding: groundingMode,
          persona,
          language,
          ...(groundingMode === 'maps' && usePuneLatLng
            ? { latLng: { latitude: 18.2947, longitude: 73.6353 } }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI service unavailable.');
      }

      const citations: AiCitation[] = Array.isArray(data.citations) ? data.citations : [];
      if (user && targetSessionId) {
        await appendAiMessage({
          uid: user.uid,
          sessionId: targetSessionId,
          role: 'assistant',
          text: String(data.text),
          model: String(data.model ?? ''),
          thinkingLevel: String(data.thinkingLevel ?? ''),
          groundingMode,
          citations,
        });
      } else {
        setGuestMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: String(data.text),
            model: String(data.model ?? ''),
            thinkingLevel: String(data.thinkingLevel ?? ''),
            groundingMode,
            citations,
          },
        ]);
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setChatSending(false);
    }
  };

  // --- Live Voice Lifecycle (gemini-3.8-live) ---
  const stopPlaybackQueue = () => {
    scheduledSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    scheduledSourcesRef.current.clear();
    if (playbackCtxRef.current) {
      nextStartTimeRef.current = playbackCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  const stopLiveSession = (nextStatus: 'idle' | 'error' = 'idle') => {
    liveCancelledRef.current = true;
    if (liveConnectTimerRef.current) {
      clearTimeout(liveConnectTimerRef.current);
      liveConnectTimerRef.current = null;
    }
    setLiveStatus((cur) => (cur === 'connected' || cur === 'connecting' ? 'closing' : cur));
    stopPlaybackQueue();
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    mediaStreamRef.current = null;
    if (captureCtxRef.current) {
      void captureCtxRef.current.close().catch(() => {});
      captureCtxRef.current = null;
    }
    if (playbackCtxRef.current) {
      void playbackCtxRef.current.close().catch(() => {});
      playbackCtxRef.current = null;
    }
    if (liveWsRef.current) {
      const wsToClose = liveWsRef.current;
      liveWsRef.current = null;
      try {
        if (wsToClose.readyState === WebSocket.OPEN || wsToClose.readyState === WebSocket.CONNECTING) {
          wsToClose.close(1000, 'Session ended');
        }
      } catch {
        // ignore
      }
    }
    setLiveStatus(nextStatus);
  };

  useEffect(() => {
    return () => {
      stopLiveSession('idle');
      recorderRef.current?.cancel();
    };
  }, []);

  const schedulePcm24kAudio = (base64Data: string) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const int16 = base64ToInt16(base64Data);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime + 0.02, nextStartTimeRef.current);
    nextStartTimeRef.current = startTime + buffer.duration;
    scheduledSourcesRef.current.add(src);
    src.onended = () => {
      scheduledSourcesRef.current.delete(src);
    };
    src.start(startTime);
  };

  const startLiveSession = async () => {
    stopLiveSession('idle');
    setLiveError(null);
    setLiveTranscripts([]);

    if (!user) {
      setLiveError('Please sign in with Google before starting a Live Voice session.');
      setLiveStatus('error');
      return;
    }

    liveCancelledRef.current = false;
    setLiveStatus('connecting');

    try {
      const idToken = await user.getIdToken();
      if (liveCancelledRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (liveCancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const captureCtx = new AudioCtx({ sampleRate: 16000 });
      const playbackCtx = new AudioCtx({ sampleRate: 24000 });
      captureCtxRef.current = captureCtx;
      playbackCtxRef.current = playbackCtx;
      nextStartTimeRef.current = playbackCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/live?lang=${language}&token=${encodeURIComponent(idToken)}`
      );
      liveWsRef.current = ws;

      liveConnectTimerRef.current = setTimeout(() => {
        if (liveWsRef.current === ws) {
          setLiveError('Live Voice connection timed out. Please retry or use standard chat.');
          stopLiveSession('error');
        }
      }, 12_000);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as {
            type?: string;
            data?: string;
            text?: string;
            error?: string;
          };
          if (msg.type === 'ready') {
            if (liveConnectTimerRef.current) {
              clearTimeout(liveConnectTimerRef.current);
              liveConnectTimerRef.current = null;
            }
            setLiveStatus('connected');
          } else if (msg.type === 'audio' && msg.data) {
            schedulePcm24kAudio(msg.data);
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
          } else if (msg.type === 'input_transcript' && msg.text) {
            setLiveTranscripts((prev) => [
              ...prev.slice(-30),
              { id: `in-${Date.now()}-${prev.length}`, speaker: 'user', text: msg.text! },
            ]);
          } else if (msg.type === 'output_transcript' && msg.text) {
            setLiveTranscripts((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: `${last.text}${msg.text}` },
                ];
              }
              return [
                ...prev.slice(-30),
                { id: `out-${Date.now()}-${prev.length}`, speaker: 'assistant', text: msg.text! },
              ];
            });
          } else if (msg.type === 'closed') {
            stopLiveSession('idle');
          } else if (msg.type === 'error') {
            setLiveError(msg.error || 'Gemini Live voice stream error.');
            stopLiveSession('error');
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        setLiveError('Unable to connect to real-time voice WebSocket (/ws/live).');
        stopLiveSession('error');
      };

      ws.onclose = () => {
        if (liveConnectTimerRef.current) {
          clearTimeout(liveConnectTimerRef.current);
          liveConnectTimerRef.current = null;
        }
        setLiveStatus((cur) => (cur === 'error' ? 'error' : 'idle'));
      };

      const source = captureCtx.createMediaStreamSource(stream);
      const processor = captureCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (ev) => {
        const activeWs = liveWsRef.current;
        if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
        const raw = ev.inputBuffer.getChannelData(0);
        const pcm16 = downsampleTo16k(raw, captureCtx.sampleRate);
        try {
          activeWs.send(
            JSON.stringify({
              type: 'audio',
              mimeType: 'audio/pcm;rate=16000',
              data: int16ToBase64(pcm16),
            })
          );
        } catch {
          // ignore send errors on closing socket
        }
      };

      const zeroGain = captureCtx.createGain();
      zeroGain.gain.value = 0;
      source.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(captureCtx.destination);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Microphone permission is required for Live Voice.');
      stopLiveSession('error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10243A] dark:text-white">
            RAKSHA AI Navigator &amp; Live Voice
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Non-diagnostic multilingual navigation, Google Maps &amp; Search grounding, voice dictation, and real-time voice assistance.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Assistant mode"
          className="inline-flex rounded-xl bg-slate-200/80 dark:bg-slate-800 p-1 self-start sm:self-auto shrink-0"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
            className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'chat'
                ? 'bg-white dark:bg-slate-900 text-[#10243A] dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span>Multi-Turn Chat &amp; Grounding</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'live'}
            onClick={() => setActiveTab('live')}
            className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'live'
                ? 'bg-[#087F8C] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Radio className="h-4 w-4 shrink-0" />
            <span>Live Voice (Audio)</span>
          </button>
        </div>
      </div>

      {/* Non-diagnostic Safety Banner */}
      <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/75 dark:bg-amber-950/30 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-100">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <AlertTriangle className="h-4 w-4 text-[#C81E1E] shrink-0 mt-0.5" />
          <span>
            <strong>Navigation Support Only — Not Medical Advice.</strong> Never delay emergency care for chest pain, severe bleeding, breathing distress, or unconsciousness.
          </span>
        </div>
        <a
          href="tel:108"
          className="inline-flex items-center gap-1.5 font-bold text-[#C81E1E] dark:text-red-300 hover:underline shrink-0"
        >
          <PhoneCall className="h-3.5 w-3.5" />
          Dial 108 / 112
        </a>
      </div>

      {activeTab === 'chat' ? (
        <div className="grid gap-5 lg:grid-cols-12 items-start">
          {/* Left Sidebar: Saved Sessions & Controls */}
          <SurfaceCard className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#10243A] dark:text-white">Session &amp; Model Config</h2>
              <Button variant="outline" size="sm" onClick={() => void handleNewSession()}>
                <Plus className="h-3.5 w-3.5" />
                <span>New Chat</span>
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block">
                <span className="font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  Assistant Persona
                </span>
                <select
                  value={persona}
                  onChange={(e) => setPersona(e.target.value as AiPersona)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3"
                >
                  <option value="navigator">Maharashtra Healthcare Navigator</option>
                  <option value="asha_helper">ASHA / ANM Field Checklist Helper</option>
                  <option value="emergency_prep">Emergency 108/112 Prep Guide</option>
                </select>
              </label>

              <label className="block">
                <span className="font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  Model &amp; Reasoning Depth
                </span>
                <select
                  value={modelMode}
                  onChange={(e) => setModelMode(e.target.value as AiModelMode)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3"
                >
                  <option value="balanced">Balanced (gemini-4-hydrogen · Low Thinking)</option>
                  <option value="deep">Deep Reasoning (gemini-4-hydrogen · High Thinking)</option>
                  <option value="fast">Fast Reply (gemini-3.1-flash-lite · Minimal)</option>
                </select>
              </label>

              <label className="block">
                <span className="font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  Live Grounding Source
                </span>
                <select
                  value={groundingMode}
                  onChange={(e) => setGroundingMode(e.target.value as AiGroundingMode)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3"
                >
                  <option value="none">Standard RAKSHA Knowledge</option>
                  <option value="maps">Google Maps Grounding (Places &amp; Reviews)</option>
                  <option value="search">Google Search Grounding (Public Web Sources)</option>
                </select>
              </label>

              {groundingMode === 'maps' && (
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={usePuneLatLng}
                    onChange={(e) => setUsePuneLatLng(e.target.checked)}
                    className="h-4 w-4 accent-[#087F8C]"
                  />
                  <span>Bias Maps search near Pune Rural (18.29, 73.63)</span>
                </label>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Saved Conversations
              </div>
              {!user ? (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-2">
                  <p className="text-slate-600 dark:text-slate-400">
                    Guest chat works immediately. Sign in with Google to save and resume multi-turn sessions privately in Firestore.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void signInWithGoogle()}>
                    Sign In to Persist History
                  </Button>
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-slate-500">Send a message to create your first saved session.</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {sessions.map((s) => (
                    <div
                      key={s.sessionId}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                        activeSessionId === s.sessionId
                          ? 'border-[#087F8C] bg-[#087F8C]/8 text-[#10243A] dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSessionId(s.sessionId);
                          setModelMode(s.modelMode);
                          setGroundingMode(s.groundingMode);
                          setPersona(s.persona);
                        }}
                        className="flex-1 text-left truncate font-medium cursor-pointer"
                      >
                        {s.title}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${s.title}`}
                        onClick={() => {
                          void deleteAiSession(user.uid, s.sessionId);
                          if (activeSessionId === s.sessionId) setActiveSessionId(null);
                        }}
                        className="text-slate-400 hover:text-[#C81E1E] cursor-pointer p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SurfaceCard>

          {/* Right Panel: Conversation Thread */}
          <SurfaceCard className="lg:col-span-8 flex flex-col min-h-[540px]">
            <div className="flex-1 space-y-4 max-h-[430px] overflow-y-auto pr-1">
              {displayedMessages.length === 0 ? (
                <div className="py-10 text-center space-y-4">
                  <Sparkles className="h-8 w-8 text-[#087F8C] dark:text-[#16B8C5] mx-auto" />
                  <div>
                    <h3 className="text-base font-bold text-[#10243A] dark:text-white">
                      Ask RAKSHA Navigator
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                      Switch between Google Maps grounding for real public hospitals/pharmacies or Google Search grounding for Maharashtra health schemes (MJPJAY / AB-PMJAY).
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      'How does a PHC-to-District Hospital referral work in Maharashtra?',
                      'Find blood banks and government hospitals near Baramati',
                      'What documents are needed for MJPJAY rural health coverage?',
                    ].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => void sendMessageText(sample)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-left hover:border-[#087F8C] cursor-pointer"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                displayedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-2xl p-4 ${
                      msg.role === 'user'
                        ? 'bg-[#10243A] text-white ml-6 sm:ml-14'
                        : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 mr-2 sm:mr-8'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-75 mb-1.5">
                      <span className="font-semibold">
                        {msg.role === 'user' ? 'You' : 'RAKSHA Assistant'}
                      </span>
                      {msg.model && (
                        <span className="font-mono">
                          {msg.model}
                          {msg.thinkingLevel ? ` · ${msg.thinkingLevel}` : ''}
                          {msg.groundingMode && msg.groundingMode !== 'none'
                            ? ` · ${msg.groundingMode}`
                            : ''}
                        </span>
                      )}
                    </div>

                    {msg.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      renderSafeMarkdown(msg.text)
                    )}

                    {/* Grounding Citations (Maps & Search) */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Grounded Sources ({msg.citations.length})
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {msg.citations.map((cit, idx) => (
                            <a
                              key={`${cit.uri}-${idx}`}
                              href={cit.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs hover:border-[#087F8C] transition-colors"
                            >
                              {cit.kind === 'maps' ? (
                                <MapPin className="h-3.5 w-3.5 text-[#087F8C] shrink-0 mt-0.5" />
                              ) : (
                                <Globe className="h-3.5 w-3.5 text-[#087F8C] shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-[#10243A] dark:text-slate-100 truncate">
                                  {cit.title}
                                </div>
                                {cit.snippet && (
                                  <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                    {cit.snippet}
                                  </div>
                                )}
                              </div>
                              <ExternalLink className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {chatSending && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-xs text-slate-500">
                  Generating grounded guidance...
                </div>
              )}
              <div ref={threadEndRef} />
            </div>

            {chatError && (
              <div className="mt-3 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-2.5 text-xs text-[#C81E1E] dark:text-red-300">
                {chatError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessageText(promptInput);
              }}
              className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Ask in English, हिन्दी, or मराठी — or record voice audio..."
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 text-sm"
              />
              <div className="flex items-center gap-2 shrink-0">
                {isAudioRecordingSupported() && (
                  <Button
                    type="button"
                    variant={recordingClip ? 'emergency' : 'outline'}
                    size="md"
                    disabled={transcribingClip || chatSending}
                    onClick={() => void handleToggleDictation()}
                  >
                    {recordingClip ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    <span>
                      {recordingClip
                        ? 'Stop & Transcribe'
                        : transcribingClip
                          ? 'Transcribing...'
                          : 'Voice'}
                    </span>
                  </Button>
                )}
                <Button type="submit" size="md" disabled={chatSending || !promptInput.trim()}>
                  <Send className="h-4 w-4" />
                  <span>Send</span>
                </Button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      ) : (
        /* Tab 2: Live Voice API (gemini-3.8-live) */
        <SurfaceCard className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
                Real-Time Voice Navigator (gemini-3.8-live)
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Full-duplex 16kHz microphone streaming and 24kHz voice response in your active language ({language.toUpperCase()}). Interrupt anytime by speaking.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {!user ? (
                <Button variant="primary" size="md" onClick={() => void signInWithGoogle()}>
                  <span>Sign In to Use Live Voice</span>
                </Button>
              ) : liveStatus === 'connected' || liveStatus === 'connecting' || liveStatus === 'closing' ? (
                <Button
                  variant="emergency"
                  size="md"
                  disabled={liveStatus === 'closing'}
                  onClick={() => stopLiveSession('idle')}
                >
                  <MicOff className="h-4 w-4" />
                  <span>{liveStatus === 'closing' ? 'Closing...' : 'End Live Voice'}</span>
                </Button>
              ) : (
                <Button variant="primary" size="md" onClick={() => void startLiveSession()}>
                  <Radio className="h-4 w-4" />
                  <span>Start Live Voice Call</span>
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span>
              Voice Session Status:{' '}
              <strong className="uppercase">{liveStatus}</strong>
            </span>
            <span className="font-mono text-slate-500">16kHz PCM Up · 24kHz PCM Down</span>
          </div>

          {liveError && (
            <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-[#C81E1E] dark:text-red-300">
              {liveError}
            </div>
          )}

          <div className="min-h-[260px] max-h-[380px] overflow-y-auto space-y-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
            {liveTranscripts.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-12">
                {liveStatus === 'connected'
                  ? 'Listening — ask about nearby PHCs, hospital referrals, or emergency preparation.'
                  : 'Press "Start Live Voice Call" and grant microphone permission to speak directly with RAKSHA Navigator.'}
              </p>
            ) : (
              liveTranscripts.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded-xl px-3.5 py-2.5 text-sm ${
                    entry.speaker === 'user'
                      ? 'bg-[#10243A] text-white ml-8'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mr-8'
                  }`}
                >
                  <div className="text-[11px] font-semibold opacity-70 mb-0.5">
                    {entry.speaker === 'user' ? 'You (Mic)' : 'RAKSHA Voice'}
                  </div>
                  <p>{entry.text}</p>
                </div>
              ))
            )}
          </div>
        </SurfaceCard>
      )}
    </div>
  );
};
