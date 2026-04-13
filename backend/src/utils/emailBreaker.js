/**
 * Circuit Breaker for email sending (using opossum library)
 *
 * HOW IT WORKS:
 * - When email sending works fine → circuit is CLOSED (normal operation)
 * - If 50%+ of emails fail within 10 requests → circuit OPENS (blocks all calls for 30s)
 * - After 30s → circuit goes HALF-OPEN (allows 1 test request)
 * - If test succeeds → circuit CLOSES again. If test fails → circuit re-OPENS.
 *
 * This prevents overloading the email API when it's down,
 * and gives it time to recover instead of hammering it with retries.
 */

const CircuitBreaker = require('opossum');
const { emailMetrics } = require('@/metrics');

// Circuit breaker configuration
const BREAKER_OPTIONS = {
  timeout: 10000, // If email takes longer than 10s, count it as a failure
  errorThresholdPercentage: 50, // Open circuit if 50%+ requests fail
  resetTimeout: 30000, // Wait 30s before trying again (half-open)
  volumeThreshold: 5, // Need at least 5 requests before calculating failure %
  rollingCountTimeout: 60000, // Count failures over a 60s window
};

/**
 * Creates a circuit breaker that wraps any async function.
 * We use it to wrap the Resend API call.
 *
 * @param {Function} emailSendFn - The async function that actually sends the email
 * @returns {CircuitBreaker} - The wrapped function with circuit breaker protection
 */
function createEmailBreaker(emailSendFn) {
  const breaker = new CircuitBreaker(emailSendFn, BREAKER_OPTIONS);

  // --- Event listeners: log what's happening + update Prometheus metrics ---

  breaker.on('success', () => {
    console.log('[CircuitBreaker] Email sent successfully');
    emailMetrics.recordSuccess();
  });

  breaker.on('failure', (error) => {
    console.error('[CircuitBreaker] Email sending failed:', error.message);
    emailMetrics.recordFailure();
  });

  breaker.on('open', () => {
    // Circuit just opened — too many failures, we stop sending
    console.warn('[CircuitBreaker] Circuit OPENED — email sending is temporarily disabled');
    emailMetrics.setBreakerState('open');
  });

  breaker.on('halfOpen', () => {
    // Circuit is testing — we allow one request through
    console.info('[CircuitBreaker] Circuit HALF-OPEN — testing if email service recovered');
    emailMetrics.setBreakerState('halfOpen');
  });

  breaker.on('close', () => {
    // Circuit closed — everything is back to normal
    console.info('[CircuitBreaker] Circuit CLOSED — email service recovered');
    emailMetrics.setBreakerState('closed');
  });

  breaker.on('reject', () => {
    // A request was rejected because circuit is open
    console.warn('[CircuitBreaker] Request REJECTED — circuit is open');
    emailMetrics.recordCircuitOpen();
  });

  breaker.on('timeout', () => {
    console.warn('[CircuitBreaker] Email sending TIMED OUT (>10s)');
  });

  return breaker;
}

module.exports = { createEmailBreaker };
