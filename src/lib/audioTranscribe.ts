export interface AudioRecorderHandle {
  stopAndTranscribe: () => Promise<{ transcript: string; model: string }>;
  cancel: () => void;
  mimeType: string;
}

function selectSupportedAudioMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('Failed to encode audio clip.'));
        return;
      }
      resolve(result.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

export function isAudioRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

export async function startAudioClipRecording(
  language: 'en' | 'hi' | 'mr'
): Promise<AudioRecorderHandle> {
  if (!isAudioRecordingSupported()) {
    throw new Error('Microphone recording is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferredMime = selectSupportedAudioMime();
  const recorder = preferredMime
    ? new MediaRecorder(stream, { mimeType: preferredMime })
    : new MediaRecorder(stream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  recorder.start(250);

  const cleanupStream = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    mimeType: recorder.mimeType || preferredMime || 'audio/webm',
    cancel: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // ignore
      }
      cleanupStream();
    },
    stopAndTranscribe: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          cleanupStream();
          try {
            const actualMime = recorder.mimeType || preferredMime || 'audio/webm';
            const blob = new Blob(chunks, { type: actualMime });
            if (blob.size < 256) {
              reject(new Error('Recording was too short. Please speak for at least 1 second.'));
              return;
            }
            const audioBase64 = await blobToBase64(blob);
            const resp = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64,
                mimeType: actualMime,
                language,
              }),
            });
            const data = await resp.json();
            if (!resp.ok) {
              reject(new Error(data.error || 'Audio transcription failed.'));
              return;
            }
            resolve({
              transcript: String(data.transcript ?? '').trim(),
              model: String(data.model ?? 'gemini-3.5-transcribe'),
            });
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Failed to transcribe audio.'));
          }
        };
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          } else {
            cleanupStream();
            reject(new Error('Recorder was already stopped.'));
          }
        } catch (err) {
          cleanupStream();
          reject(err instanceof Error ? err : new Error('Failed to stop recording.'));
        }
      }),
  };
}
