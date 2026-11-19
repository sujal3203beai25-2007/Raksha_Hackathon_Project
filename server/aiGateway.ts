import { GoogleGenAI, Modality, ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';

let cachedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

/**
 * Strips common PII patterns (phone numbers, email addresses, 12-digit IDs)
 * before sending minimized context to Gemini.
 */
export function redactPiiText(input: string): string {
  return input
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/(?:\+91[\-\s]?)?[6-9]\d{9}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[REDACTED_ID]')
    .slice(0, 4000);
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s+prompt/i,
  /act\s+as\s+a\s+doctor\s+and\s+prescribe/i,
  /bypass\s+safety/i,
];

export function hasPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((rx) => rx.test(text));
}

export const FaqInputSchema = z.object({
  question: z.string().min(3).max(500),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
});

export async function generateNavigationFaq(input: z.infer<typeof FaqInputSchema>) {
  if (hasPromptInjection(input.question)) {
    throw new Error('Input blocked by safety validation.');
  }

  const ai = getGeminiClient();
  const sanitized = redactPiiText(input.question);
  const langName = input.language === 'hi' ? 'Hindi' : input.language === 'mr' ? 'Marathi' : 'English';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `User question (${langName}): ${sanitized}`,
    config: {
      systemInstruction:
        `You are a non-diagnostic public healthcare navigation assistant for RAKSHA in Maharashtra, India. ` +
        `Respond strictly in ${langName}. ` +
        `Never diagnose conditions, never prescribe medicines, never claim a user is medically safe, and never advise delaying emergency care. ` +
        `For urgent or red-flag symptoms, advise calling 108 or 112 immediately and visiting the nearest PHC/RH/SDH/DH. Keep responses concise (under 140 words).`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING, description: 'Helpful non-diagnostic navigation response.' },
          emergencyReminder: { type: Type.STRING, description: 'Clear 108/112 safety reminder.' },
          suggestedAction: {
            type: Type.STRING,
            description: 'One of: find_care, triage, emergency, referrals, general',
          },
        },
        required: ['answer', 'emergencyReminder', 'suggestedAction'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    answer: String(parsed.answer ?? ''),
    emergencyReminder: String(parsed.emergencyReminder ?? 'In an emergency, dial 108 or 112 immediately.'),
    suggestedAction: String(parsed.suggestedAction ?? 'general'),
    model: 'gemini-4-hydrogen',
    nonDiagnostic: true,
  };
}

export const ChatMessageInputSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(4000),
});

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageInputSchema).min(1).max(30),
  modelMode: z.enum(['balanced', 'deep', 'fast']).default('balanced'),
  grounding: z.enum(['none', 'search', 'maps']).default('none'),
  persona: z.enum(['navigator', 'asha_helper', 'emergency_prep']).default('navigator'),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
  latLng: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

export interface GroundingCitation {
  kind: 'maps' | 'web';
  title: string;
  uri: string;
  snippet?: string;
}

export async function generateMultiTurnChat(input: z.infer<typeof ChatRequestSchema>) {
  for (const msg of input.messages) {
    if (msg.role === 'user' && hasPromptInjection(msg.text)) {
      throw new Error('Input blocked by safety validation.');
    }
  }

  const ai = getGeminiClient();
  const langName = input.language === 'hi' ? 'Hindi' : input.language === 'mr' ? 'Marathi' : 'English';

  const personaInstructions: Record<'navigator' | 'asha_helper' | 'emergency_prep', string> = {
    navigator:
      'Guide patients and families in Maharashtra through PHC, Rural Hospital (RH), Sub-District Hospital (SDH), and District Hospital (DH) pathways, referral steps, and verified facility discovery.',
    asha_helper:
      'Support ASHA / ANM frontline community health workers with clear Maharashtra maternal/child referral checklists, consent reminders, and calm communication phrasing.',
    emergency_prep:
      'Provide calm, immediate first-response safety coordination reminders: advise dialing 108 or 112 immediately for emergencies, preparing callback numbers/village landmarks, and never delaying emergency care.',
  };

  // Use strictly free-tier models (gemini-4-hydrogen with ThinkingLevel and gemini-3.1-flash-lite)
  const useFastModel = input.modelMode === 'fast' && input.grounding === 'none';
  const modelName = useFastModel ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const thinkingLevel = useFastModel
    ? ThinkingLevel.MINIMAL
    : input.modelMode === 'deep'
      ? ThinkingLevel.HIGH
      : ThinkingLevel.LOW;

  const contents = input.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.role === 'user' ? redactPiiText(m.text) : m.text.slice(0, 4000) }],
  }));

  const config: Record<string, unknown> = {
    systemInstruction:
      `You are RAKSHA Assistant, a non-diagnostic public healthcare coordination guide for Maharashtra, India. ` +
      `${personaInstructions[input.persona]} ` +
      `Respond clearly in ${langName} using clean Markdown bullets/headings when helpful. ` +
      `Never diagnose diseases, never prescribe medicines, never claim a patient is medically safe, and always emphasize calling 108 or 112 for urgent danger signs. ` +
      `Do not invent live bed counts or unverified statistics.`,
    thinkingConfig: { thinkingLevel },
  };

  // Mutual exclusion: googleMaps and googleSearch cannot be combined in one call, and no responseSchema
  if (input.grounding === 'maps') {
    config.tools = [{ googleMaps: {} }];
    if (input.latLng) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: input.latLng.latitude,
            longitude: input.latLng.longitude,
          },
        },
      };
    }
  } else if (input.grounding === 'search') {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config,
  });

  const citations: GroundingCitation[] = [];
  const seenUris = new Set<string>();
  const candidates = (response as unknown as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
          maps?: {
            uri?: string;
            title?: string;
            placeAnswerSources?: {
              reviewSnippets?: Array<{ uri?: string; title?: string; text?: string }>;
            };
          };
        }>;
      };
    }>;
  }).candidates;

  const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of chunks) {
    if (chunk.maps?.uri && !seenUris.has(chunk.maps.uri)) {
      seenUris.add(chunk.maps.uri);
      const snippet = chunk.maps.placeAnswerSources?.reviewSnippets?.[0]?.text;
      citations.push({
        kind: 'maps',
        title: chunk.maps.title || 'Google Maps Place',
        uri: chunk.maps.uri,
        ...(snippet ? { snippet: snippet.slice(0, 220) } : {}),
      });
      const reviewUri = chunk.maps.placeAnswerSources?.reviewSnippets?.[0]?.uri;
      if (reviewUri && !seenUris.has(reviewUri)) {
        seenUris.add(reviewUri);
        citations.push({
          kind: 'maps',
          title: chunk.maps.placeAnswerSources?.reviewSnippets?.[0]?.title || `${chunk.maps.title || 'Place'} Details`,
          uri: reviewUri,
        });
      }
    }
    if (chunk.web?.uri && !seenUris.has(chunk.web.uri)) {
      seenUris.add(chunk.web.uri);
      citations.push({
        kind: 'web',
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      });
    }
  }

  return {
    text: (response.text ?? '').trim() || 'Unable to generate a response. In emergencies, please dial 108 or 112.',
    model: modelName,
    thinkingLevel,
    grounding: input.grounding,
    citations,
    nonDiagnostic: true,
  };
}

export const TranscribeInputSchema = z.object({
  audioBase64: z.string().min(16).max(11_000_000),
  mimeType: z
    .string()
    .regex(/^audio\/[a-zA-Z0-9.+_-]+(?:;\s*codecs=[a-zA-Z0-9.,_-]+)?$/)
    .default('audio/webm'),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
});

export async function transcribeAudioClip(input: z.infer<typeof TranscribeInputSchema>) {
  const ai = getGeminiClient();
  const langHint =
    input.language === 'hi'
      ? 'Hindi (Devanagari or spoken Hindustani)'
      : input.language === 'mr'
        ? 'Marathi (Devanagari or spoken Marathi)'
        : 'English (or spoken Indian English/Marathi/Hindi terms)';

  const cleanMime = input.mimeType.split(';')[0].trim() || 'audio/webm';

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: input.audioBase64,
            },
          },
          {
            text: `Generate a verbatim transcript of the spoken audio (${langHint}). Output only the spoken transcript text with no commentary or medical advice.`,
          },
        ],
      },
    ],
  });

  const transcript = redactPiiText((response.text ?? '').trim());
  return {
    transcript,
    model: 'gemini-3.5-transcribe',
  };
}

export async function createGeminiLiveSession(
  language: 'en' | 'hi' | 'mr',
  callbacks: {
    onAudioChunk: (base64Pcm24k: string, mimeType: string) => void;
    onInputTranscript: (text: string) => void;
    onOutputTranscript: (text: string) => void;
    onTurnComplete: () => void;
    onInterrupted: () => void;
    onError: (message: string) => void;
    onClose: () => void;
  }
) {
  const ai = getGeminiClient();
  const langName = language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : 'English';

  return ai.live.connect({
    model: 'gemini-3.8-live',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Kore',
          },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction:
        `You are RAKSHA Voice Navigator for public rural healthcare access in Maharashtra, India. ` +
        `Speak warmly, concisely, and clearly in ${langName}. ` +
        `Help citizens navigate PHCs, Rural Hospitals, Sub-District Hospitals, District Hospitals, referrals, and 108/112 emergency preparedness. ` +
        `Never diagnose conditions, never prescribe medicines, and always tell anyone describing severe chest pain, breathing trouble, unconsciousness, or heavy bleeding to hang up and dial 108 or 112 right away.`,
    },
    callbacks: {
      onmessage: (message) => {
        const content = message.serverContent;
        if (!content) return;
        if (content.interrupted) {
          callbacks.onInterrupted();
        }
        const parts = content.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            callbacks.onAudioChunk(part.inlineData.data, part.inlineData.mimeType || 'audio/pcm;rate=24000');
          }
        }
        if (content.inputTranscription?.text) {
          callbacks.onInputTranscript(content.inputTranscription.text);
        }
        if (content.outputTranscription?.text) {
          callbacks.onOutputTranscript(content.outputTranscription.text);
        }
        if (content.turnComplete) {
          callbacks.onTurnComplete();
        }
      },
      onerror: (err) => {
        const msg = err instanceof Error ? err.message : 'Live voice stream error';
        callbacks.onError(msg);
      },
      onclose: () => {
        callbacks.onClose();
      },
    },
  });
}

export const SummarizeReferralSchema = z.object({
  reason: z.string().min(2).max(500),
  clinicalSummary: z.string().min(2).max(2000),
  urgency: z.enum(['emergency', 'urgent', 'routine']),
  originFacilityType: z.string().max(40),
  destinationFacilityType: z.string().max(40),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
  consentGranted: z.literal(true),
});

export async function summarizeReferralForHandover(input: z.infer<typeof SummarizeReferralSchema>) {
  if (hasPromptInjection(input.reason) || hasPromptInjection(input.clinicalSummary)) {
    throw new Error('Referral text blocked by prompt-injection filter.');
  }

  const ai = getGeminiClient();
  const safeReason = redactPiiText(input.reason);
  const safeSummary = redactPiiText(input.clinicalSummary);
  const langName = input.language === 'hi' ? 'Hindi' : input.language === 'mr' ? 'Marathi' : 'English';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Urgency: ${input.urgency}\nFrom: ${input.originFacilityType} -> To: ${input.destinationFacilityType}\nReason: ${safeReason}\nClinical notes (PII redacted): ${safeSummary}`,
    config: {
      systemInstruction:
        `Summarize this de-identified inter-facility referral handover for a receiving hospital coordinator in ${langName}. ` +
        `Do NOT invent vitals, diagnoses, or medications not present in the source text. ` +
        `Output structured fields requiring clinician verification before clinical action.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          handoverHeadline: { type: Type.STRING },
          keyPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          receivingPrepFocus: { type: Type.STRING },
        },
        required: ['handoverHeadline', 'keyPoints', 'receivingPrepFocus'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    handoverHeadline: String(parsed.handoverHeadline ?? ''),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String).slice(0, 6) : [],
    receivingPrepFocus: String(parsed.receivingPrepFocus ?? ''),
    requiresClinicianReview: true,
    model: 'gemini-4-hydrogen',
  };
}

export const OperationalInsightSchema = z.object({
  metrics: z.array(
    z.object({
      district: z.string().max(80),
      avgTravelMinutesToEmergency: z.number(),
      verifiedFreshnessPct: z.number(),
      gapSeverity: z.string().max(30),
    })
  ),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
});

export async function generateOperationalInsight(input: z.infer<typeof OperationalInsightSchema>) {
  const ai = getGeminiClient();
  const langName = input.language === 'hi' ? 'Hindi' : input.language === 'mr' ? 'Marathi' : 'English';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Aggregate non-PII district metrics: ${JSON.stringify(input.metrics)}`,
    config: {
      systemInstruction:
        `You are an operational public-health analyst for Maharashtra health administrators. Respond in ${langName}. ` +
        `Provide 3 concrete, explainable operational recommendations based ONLY on the provided aggregate numbers. Do not invent data.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['summary', 'recommendations'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    summary: String(parsed.summary ?? ''),
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).slice(0, 5) : [],
    model: 'gemini-4-hydrogen',
    humanApprovalRequired: true,
  };
}
