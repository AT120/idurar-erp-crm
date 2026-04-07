/**
 * Prometheus Metrics for the IDURAR ERP backend
 *
 * WHAT THIS DOES:
 * Exposes numbers (metrics) that Prometheus scrapes every 15 seconds.
 * These metrics are then visualized in Grafana dashboards.
 *
 * THREE TYPES OF METRICS:
 * 1. Counter — only goes up (total emails sent, total failures)
 * 2. Histogram — measures durations (how long does an email take to send?)
 * 3. Gauge — goes up AND down (current circuit breaker state)
 */

const client = require('prom-client');

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
// These are free — Prometheus gets them automatically
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({
  prefix: 'idurar_', // All default metrics will start with "idurar_"
});

// --- CUSTOM METRICS ---

// 1. Counter: How many emails were sent, with what result?
// Labels let us filter: email_send_total{status="success"} vs email_send_total{status="failure"}
const emailSendTotal = new client.Counter({
  name: 'email_send_total',
  help: 'Total number of email send attempts',
  labelNames: ['status'], // "success", "failure", "circuit_open"
});

// 2. Histogram: How long does it take to send an email?
// Buckets define the "bins" — we'll see how many emails take <0.5s, <1s, <2s, etc.
const emailSendDuration = new client.Histogram({
  name: 'email_send_duration_seconds',
  help: 'Duration of email sending in seconds',
  labelNames: ['status'],
  buckets: [0.5, 1, 2, 5, 10, 15], // seconds
});

// 3. Gauge: What is the current state of the circuit breaker?
// 0 = closed (normal), 1 = open (blocking), 2 = half-open (testing)
const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Current state of email circuit breaker (0=closed, 1=open, 2=halfOpen)',
});

// 4. Counter: How many times did the circuit breaker reject a request?
const circuitBreakerRejections = new client.Counter({
  name: 'circuit_breaker_rejections_total',
  help: 'Total number of requests rejected by circuit breaker',
});

// 5. Histogram: HTTP request duration for all API endpoints
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// --- HELPER OBJECT ---
// Clean API for other files to update metrics without importing prom-client directly

const emailMetrics = {
  recordSuccess: () => {
    emailSendTotal.inc({ status: 'success' });
  },
  recordFailure: () => {
    emailSendTotal.inc({ status: 'failure' });
  },
  recordCircuitOpen: () => {
    emailSendTotal.inc({ status: 'circuit_open' });
    circuitBreakerRejections.inc();
  },
  setBreakerState: (state) => {
    const stateMap = { closed: 0, open: 1, halfOpen: 2 };
    circuitBreakerState.set(stateMap[state] || 0);
  },
  startEmailTimer: () => {
    return emailSendDuration.startTimer();
  },
};

/**
 * Express middleware to measure HTTP request durations.
 * Added to app.js so every API call is automatically timed.
 */
function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    end({
      method: req.method,
      route: route,
      status_code: res.statusCode,
    });
  });
  next();
}

module.exports = {
  client,
  emailMetrics,
  metricsMiddleware,
};
