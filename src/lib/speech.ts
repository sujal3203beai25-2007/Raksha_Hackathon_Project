import { LanguageCode } from '../shared/types.ts';

const SPEECH_LOCALE: Record<LanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
};

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakText(text: string, lang: LanguageCode): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = SPEECH_LOCALE[lang];
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function startVoiceRecognition(
  lang: LanguageCode,
  onTranscript: (text: string) => void,
  onError: (reason: 'unsupported' | 'permission_denied' | 'error') => void,
  onEnd?: () => void
): () => void {
  if (!isSpeechRecognitionSupported()) {
    onError('unsupported');
    return () => {};
  }

  const Win = window as unknown as {
    SpeechRecognition?: new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: (event: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    webkitSpeechRecognition?: new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: (event: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
  };

  const Ctor = Win.SpeechRecognition || Win.webkitSpeechRecognition;
  if (!Ctor) {
    onError('unsupported');
    return () => {};
  }

  const recognition = new Ctor();
  recognition.lang = SPEECH_LOCALE[lang];
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript;
    if (transcript) {
      onTranscript(transcript);
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      onError('permission_denied');
    } else {
      onError('error');
    }
  };

  recognition.onend = () => {
    onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    onError('error');
  }

  return () => {
    try {
      recognition.stop();
    } catch {
      // ignore stop error
    }
  };
}
