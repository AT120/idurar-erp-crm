/**
 * OpenTelemetry Tracing Configuration
 *
 * MUST be loaded BEFORE any other imports in server.js!
 * Why? Because OpenTelemetry needs to "monkey-patch" Express, HTTP, and MongoDB
 * BEFORE they are loaded, so it can intercept all calls automatically.
 *
 * WHAT THIS DOES:
 * - Automatically traces every HTTP request through Express
 * - Automatically traces every MongoDB query
 * - Sends all traces to Jaeger via OTLP protocol
 * - Each trace shows the full journey of a request (like a GPS track)
 *
 * WHERE TO SEE TRACES:
 * Open Jaeger UI at http://localhost:16686
 * Select service "idurar-backend" → Find Traces
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
// Where to send traces — Jaeger's OTLP HTTP endpoint
const JAEGER_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

const sdk = new NodeSDK({
  // Identify this service in Jaeger
  serviceName: 'idurar-backend',

  // Send traces to Jaeger via OTLP HTTP
  traceExporter: new OTLPTraceExporter({
    url: `${JAEGER_ENDPOINT}/v1/traces`,
  }),

  // Auto-instrument these libraries — no code changes needed!
  // Every Express route, HTTP call, and MongoDB query gets traced automatically
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable fs instrumentation — it creates too much noise (every file read)
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

// Start the SDK — this must happen before any other imports
sdk.start();
console.log('[Tracing] OpenTelemetry initialized — sending traces to', JAEGER_ENDPOINT);

// Graceful shutdown — flush remaining traces when the app stops
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[Tracing] OpenTelemetry shut down gracefully'))
    .catch((err) => console.error('[Tracing] Error shutting down:', err));
});

module.exports = sdk;
