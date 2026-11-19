import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import firebaseConfig from './firebase-applet-config.json';
import {
  ChatRequestSchema,
  createGeminiLiveSession,
  FaqInputSchema,
  generateMultiTurnChat,
  generateNavigationFaq,
  generateOperationalInsight,
  OperationalInsightSchema,
  summarizeReferralForHandover,
  SummarizeReferralSchema,
  transcribeAudioClip,
  TranscribeInputSchema,
} from './server/aiGateway.ts';
import { OPENAPI_SPEC } from './server/openapi.ts';
import { MAHARASHTRA_REFERENCE_FACILITIES } from './src/shared/seedData.ts';
import {
  isAllowedWsTenant,
  isWsBroadcastAuthorized,
  isWsSubscriptionAuthorized,
  WsTenantRoom,
} from './src/shared/wsPolicy.ts';

// Initialize Firebase Admin ONLY for ID token verification (no IAM required).
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminAuth = getAuth();

interface AuthedRequest extends Request {
  user?: DecodedIdToken;
  correlationId?: string;
}

// Simple in-memory sliding-window rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    if (!checkRateLimit(key, maxRequests, windowMs)) {
      return res.status(429).json({
        error: 'Too many requests. Please wait briefly before retrying.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }
    return next();
  };
}

async function requireFirebaseAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required (missing Bearer token).',
      correlationId: req.correlationId,
    });
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired authentication token.',
      correlationId: req.correlationId,
    });
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const wssLive = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  // WebSocket room subscriptions keyed by tenantId and verified Firebase uid
  const wsClients = new Map<
    WebSocket,
    { tenantId: WsTenantRoom | null; uid: string | null; isAlive: boolean }
  >();

  const wsHeartbeat = setInterval(() => {
    for (const [client, meta] of wsClients.entries()) {
      if (!meta.isAlive) {
        wsClients.delete(client);
        client.terminate();
        continue;
      }
      meta.isAlive = false;
      try {
        client.ping();
      } catch {
        // ignore ping errors on closing socket
      }
    }
  }, 30_000);
  wss.on('close', () => clearInterval(wsHeartbeat));

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws', 'http://localhost');
    const initialToken = reqUrl.searchParams.get('token')?.trim() || '';
    const clientMeta: { tenantId: WsTenantRoom | null; uid: string | null; isAlive: boolean } = {
      tenantId: null,
      uid: null,
      isAlive: true,
    };
    wsClients.set(ws, clientMeta);

    let authPending: Promise<void> = initialToken
      ? adminAuth
          .verifyIdToken(initialToken)
          .then((decoded) => {
            clientMeta.uid = decoded.uid;
          })
          .catch(() => {
            clientMeta.uid = null;
          })
      : Promise.resolve();

    const sendWsJson = (payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(payload));
        } catch {
          // ignore send errors on closing socket
        }
      }
    };

    ws.on('pong', () => {
      clientMeta.isAlive = true;
    });

    ws.on('error', () => {
      wsClients.delete(ws);
    });

    ws.on('message', (raw) => {
      void (async () => {
        try {
          await authPending;
          const msg = JSON.parse(String(raw)) as {
            type?: string;
            token?: string;
            tenantId?: string;
            event?: string;
            payload?: Record<string, unknown>;
          };

          if (msg.type === 'auth' && typeof msg.token === 'string' && msg.token.trim()) {
            authPending = adminAuth
              .verifyIdToken(msg.token.trim())
              .then((decoded) => {
                clientMeta.uid = decoded.uid;
                sendWsJson({ type: 'authenticated', uid: decoded.uid });
              })
              .catch(() => {
                clientMeta.uid = null;
                sendWsJson({
                  type: 'error',
                  code: 'UNAUTHORIZED',
                  error: 'Invalid or expired authentication token.',
                });
              });
            await authPending;
            return;
          }

          if (msg.type === 'subscribe') {
            if (!isAllowedWsTenant(msg.tenantId)) {
              sendWsJson({ type: 'error', code: 'INVALID_TENANT', error: 'Unknown tenant room.' });
              return;
            }
            if (!isWsSubscriptionAuthorized(msg.tenantId, Boolean(clientMeta.uid))) {
              sendWsJson({
                type: 'error',
                code: 'UNAUTHORIZED',
                error: 'Sign in required to subscribe to live Maharashtra coordination.',
              });
              return;
            }
            clientMeta.tenantId = msg.tenantId;
            sendWsJson({
              type: 'subscribed',
              tenantId: msg.tenantId,
              authenticated: Boolean(clientMeta.uid),
              timestamp: new Date().toISOString(),
            });
            return;
          }

          if (msg.type === 'broadcast') {
            if (!isAllowedWsTenant(msg.tenantId)) {
              sendWsJson({ type: 'error', code: 'INVALID_TENANT', error: 'Unknown tenant room.' });
              return;
            }
            if (!isWsBroadcastAuthorized(msg.tenantId, Boolean(clientMeta.uid))) {
              sendWsJson({
                type: 'error',
                code: 'UNAUTHORIZED',
                error: 'Sign in required to broadcast live Maharashtra coordination events.',
              });
              return;
            }
            const safeEvent =
              typeof msg.event === 'string' && msg.event.trim()
                ? msg.event.trim().slice(0, 64)
                : 'state:updated';
            const outbound = JSON.stringify({
              type: 'event',
              tenantId: msg.tenantId,
              event: safeEvent,
              payload: msg.payload && typeof msg.payload === 'object' ? msg.payload : {},
              timestamp: new Date().toISOString(),
            });
            for (const [client, meta] of wsClients.entries()) {
              if (client.readyState === WebSocket.OPEN && meta.tenantId === msg.tenantId) {
                try {
                  client.send(outbound);
                } catch {
                  // ignore individual socket failure
                }
              }
            }
          }
        } catch {
          sendWsJson({ type: 'error', code: 'BAD_MESSAGE', error: 'Malformed WebSocket message.' });
        }
      })();
    });

    ws.on('close', () => {
      wsClients.delete(ws);
    });
  });

  // Real-time Gemini Live Voice WebSocket bridge (/ws/live) — Firebase auth required
  wssLive.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws/live', 'http://localhost');
    const langParam = reqUrl.searchParams.get('lang');
    const token = reqUrl.searchParams.get('token')?.trim() || '';
    const initialLang: 'en' | 'hi' | 'mr' =
      langParam === 'hi' || langParam === 'mr' ? langParam : 'en';

    let liveSession: Awaited<ReturnType<typeof createGeminiLiveSession>> | null = null;
    let closing = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(payload));
        } catch {
          // ignore send errors on closing socket
        }
      }
    };

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch {
          // ignore ping errors
        }
      }
    }, 25_000);

    ws.on('error', () => {
      closing = true;
      clearInterval(pingInterval);
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
      liveSession = null;
    });

    void (async () => {
      if (!token) {
        sendJson({
          type: 'error',
          code: 'UNAUTHORIZED',
          error: 'Sign in with Google is required for Gemini Live voice.',
        });
        ws.close(4401, 'Unauthorized');
        return;
      }

      try {
        await adminAuth.verifyIdToken(token);
      } catch {
        sendJson({
          type: 'error',
          code: 'UNAUTHORIZED',
          error: 'Invalid or expired authentication token for Gemini Live voice.',
        });
        ws.close(4401, 'Unauthorized');
        return;
      }

      if (closing || ws.readyState !== WebSocket.OPEN) return;

      try {
        const session = await createGeminiLiveSession(initialLang, {
          onAudioChunk: (data, mimeType) => {
            sendJson({ type: 'audio', data, mimeType });
          },
          onInputTranscript: (text) => {
            sendJson({ type: 'input_transcript', text });
          },
          onOutputTranscript: (text) => {
            sendJson({ type: 'output_transcript', text });
          },
          onTurnComplete: () => {
            sendJson({ type: 'turn_complete' });
          },
          onInterrupted: () => {
            sendJson({ type: 'interrupted' });
          },
          onError: (message) => {
            sendJson({ type: 'error', error: message });
          },
          onClose: () => {
            if (!closing) {
              sendJson({ type: 'closed' });
            }
          },
        });

        if (closing || ws.readyState !== WebSocket.OPEN) {
          try {
            session.close();
          } catch {
            // ignore
          }
          return;
        }
        liveSession = session;
        sendJson({ type: 'ready', model: 'gemini-3.8-live', language: initialLang });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to start Gemini Live session.';
        sendJson({ type: 'error', error: msg });
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1011, 'Gemini Live unavailable');
        }
      }
    })();

    ws.on('message', (raw) => {
      if (!liveSession || closing) return;
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          data?: string;
          mimeType?: string;
          text?: string;
        };
        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: msg.mimeType || 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text.trim().slice(0, 1000) }] }],
            turnComplete: true,
          });
        }
      } catch {
        // Ignore malformed client frames cleanly
      }
    });

    ws.on('close', () => {
      closing = true;
      clearInterval(pingInterval);
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
      liveSession = null;
    });
  });

  // Route WebSocket upgrades cleanly by path without colliding with Vite HMR (/vite-hmr)
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      const ip = request.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`${ip}:/ws`, 30, 60_000)) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return;
    }
    if (pathname === '/ws/live') {
      const ip = request.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`${ip}:/ws/live`, 15, 60_000)) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wssLive.handleUpgrade(request, socket, head, (ws) => {
        wssLive.emit('connection', ws, request);
      });
      return;
    }
    if (pathname === '/vite-hmr') {
      // Handled directly by Vite's attached HMR WebSocketServer
      return;
    }
    socket.destroy();
  });

  // Security headers & correlation ID
  app.use((req: AuthedRequest, res, next) => {
    const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Request-Id', correlationId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self)');
    next();
  });

  // Audio transcription endpoint uses larger 12MB JSON body parser mounted BEFORE global 256kb limit
  app.post(
    '/api/ai/transcribe',
    express.json({ limit: '12mb' }),
    rateLimit(15, 60_000),
    async (req: AuthedRequest, res) => {
      const parsed = TranscribeInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid audio transcription payload.',
          details: parsed.error.flatten(),
          correlationId: req.correlationId,
        });
      }
      try {
        const result = await transcribeAudioClip(parsed.data);
        return res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Audio transcription failed';
        return res.status(502).json({ error: message, correlationId: req.correlationId });
      }
    }
  );

  app.use(express.json({ limit: '256kb' }));

  // Health & operational gate status
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'raksha-platform',
      liveDispatchEnabled: process.env.RAKSHA_ALLOW_LIVE_DISPATCH === 'true',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      mapsKeyConfigured: Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // OpenAPI 3.1 spec
  app.get('/api/openapi.json', (_req, res) => {
    res.json(OPENAPI_SPEC);
  });

  // Public Maharashtra reference facility dataset (static directory provenance)
  app.get('/api/facilities/reference', (_req, res) => {
    res.json({
      facilities: MAHARASHTRA_REFERENCE_FACILITIES,
      provenanceNote:
        'Static public directory baseline. Real-time bed, ICU, and oxygen counts are never inferred and remain Unknown unless reported by verified facility staff.',
    });
  });

  // Server-side non-diagnostic multilingual FAQ via Gemini
  app.post('/api/ai/faq', rateLimit(20, 60_000), async (req: AuthedRequest, res) => {
    const parsed = FaqInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid FAQ query payload.', details: parsed.error.flatten(), correlationId: req.correlationId });
    }
    try {
      const result = await generateNavigationFaq(parsed.data);
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI service unavailable';
      return res.status(502).json({ error: message, correlationId: req.correlationId });
    }
  });

  // Multi-turn Gemini chat with ThinkingLevel, Search grounding, and Maps grounding
  app.post('/api/ai/chat', rateLimit(25, 60_000), async (req: AuthedRequest, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid chat payload.',
        details: parsed.error.flatten(),
        correlationId: req.correlationId,
      });
    }
    try {
      const result = await generateMultiTurnChat(parsed.data);
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI chat service unavailable';
      return res.status(502).json({ error: message, correlationId: req.correlationId });
    }
  });

  // Authenticated referral summarization (consent-gated + clinician-review flagged)
  app.post('/api/ai/summarize-referral', rateLimit(15, 60_000), requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const parsed = SummarizeReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid referral summarization request or missing explicit consent.', details: parsed.error.flatten(), correlationId: req.correlationId });
    }
    try {
      const result = await summarizeReferralForHandover(parsed.data);
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI summarization failed';
      return res.status(502).json({ error: message, correlationId: req.correlationId });
    }
  });

  // Authenticated aggregate operational insight
  app.post('/api/ai/operational-insight', rateLimit(10, 60_000), requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const parsed = OperationalInsightSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid aggregate metrics payload.', details: parsed.error.flatten(), correlationId: req.correlationId });
    }
    try {
      const result = await generateOperationalInsight(parsed.data);
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI operational insight failed';
      return res.status(502).json({ error: message, correlationId: req.correlationId });
    }
  });

  // Structural FHIR R4 ServiceRequest Adapter (explicitly marked non-certified)
  app.post('/api/fhir/ServiceRequest/convert', requireFirebaseAuth, (req: AuthedRequest, res) => {
    const body = req.body as {
      referralId?: string;
      status?: string;
      urgency?: string;
      originFacilityName?: string;
      destinationFacilityName?: string;
      reason?: string;
    };
    if (!body?.referralId || !body?.reason) {
      return res.status(400).json({ error: 'referralId and reason are required', correlationId: req.correlationId });
    }
    const statusMap: Record<string, string> = {
      draft: 'draft',
      submitted: 'active',
      under_review: 'active',
      accepted: 'active',
      in_transit: 'active',
      completed: 'completed',
      cancelled: 'revoked',
      rejected: 'revoked',
      expired: 'entered-in-error',
    };
    res.json({
      resourceType: 'ServiceRequest',
      id: body.referralId,
      meta: {
        tag: [
          {
            system: 'https://raksha.example.org/interop-status',
            code: 'structural-preview-only',
            display: 'FHIR R4 structural adapter only — not ABDM/NHCX certified',
          },
        ],
      },
      status: statusMap[body.status ?? 'submitted'] ?? 'active',
      intent: 'order',
      priority: body.urgency === 'emergency' ? 'stat' : body.urgency === 'urgent' ? 'urgent' : 'routine',
      reasonCode: [{ text: body.reason }],
      requester: { display: body.originFacilityName ?? 'Origin Facility' },
      performer: [{ display: body.destinationFacilityName ?? 'Receiving Facility' }],
      authoredOn: new Date().toISOString(),
    });
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const previewHosts = ['localhost', '127.0.0.1', '.run.app'];
    if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
      try {
        previewHosts.push(new URL(process.env.APP_URL).hostname);
      } catch {
        // ignore invalid APP_URL
      }
    }

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: previewHosts,
        ws: {
          server,
          path: '/vite-hmr',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RAKSHA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RAKSHA server:', err);
  process.exit(1);
});
