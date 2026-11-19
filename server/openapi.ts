export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'RAKSHA Public Healthcare Coordination API',
    version: '1.0.0',
    description:
      'REST API for RAKSHA healthcare access, facility provenance, rules-based triage, referral state machine, FHIR structural adapters, and gated AI assistance. Pilot system — not an authorized emergency dispatch service.',
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Service health and operational dispatch gate status',
        responses: { '200': { description: 'Healthy' } },
      },
    },
    '/api/facilities/reference': {
      get: {
        summary: 'Public Maharashtra static directory reference facilities with provenance metadata',
        responses: { '200': { description: 'List of reference facilities (capacities marked Unknown unless verified live)' } },
      },
    },
    '/api/ai/faq': {
      post: {
        summary: 'Non-diagnostic multilingual healthcare navigation assistant',
        responses: { '200': { description: 'Structured navigation answer' }, '429': { description: 'Rate limit exceeded' } },
      },
    },
    '/api/ai/summarize-referral': {
      post: {
        summary: 'De-identified referral handover summarization (requires Firebase Bearer token and explicit consent)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Draft handover summary flagged for clinician review' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/api/ai/operational-insight': {
      post: {
        summary: 'Aggregate district access-gap operational insights (requires Firebase Bearer token)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Explainable insights' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/api/fhir/ServiceRequest/convert': {
      post: {
        summary: 'Structural FHIR R4 ServiceRequest resource adapter (non-certified preview)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'FHIR R4 ServiceRequest JSON bundle' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Firebase JWT',
      },
    },
  },
};
