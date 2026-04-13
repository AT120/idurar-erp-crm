/**
 * Invoice Email Sending Controller
 *
 * FLOW:
 * 1. Find the invoice in the database
 * 2. Generate a PDF from the invoice data
 * 3. Send the PDF by email via Resend API (protected by Circuit Breaker)
 * 4. Mark the invoice as "sent" in the database
 *
 * RESILIENCE LAYERS (defense in depth):
 * - Artem's retries (frontend) → retries the whole request 3 times
 * - Artem's idempotency (Redis) → prevents duplicate sends
 * - OUR Circuit Breaker (opossum) → stops calling a dead API
 * - OUR Tracing (OpenTelemetry) → shows exactly where things slow down or fail
 * - OUR Metrics (Prometheus) → counts successes/failures for Grafana dashboards
 */

const fs = require('fs');
const custom = require('@/controllers/pdfController');
const { SendInvoice } = require('@/emailTemplate/SendEmailTemplate');
const mongoose = require('mongoose');
const InvoiceModel = mongoose.model('Invoice');
const { Resend } = require('resend');
const { loadSettings } = require('@/middlewares/settings');
const { createEmailBreaker } = require('@/utils/emailBreaker');
const { emailMetrics } = require('@/metrics');
const { trace, SpanStatusCode } = require('@opentelemetry/api');

// Get a tracer — this is our "GPS tracker" for following the invoice flow
const tracer = trace.getTracer('invoice-service');

// --- The raw email sending function (what Artem wrote, slightly cleaned up) ---
const rawSendEmail = async ({ email, name, targetLocation }) => {
  const resend = new Resend(process.env.RESEND_API);

  const settings = await loadSettings();
  const idurar_app_email = process.env.COMPANY_EMAIL;
  const idurar_app_company_email = settings['idurar_app_company_email'];
  const company_name = settings['company_name'];

  const attachedFile = fs.readFileSync(targetLocation);

  const { data } = await resend.emails.send({
    from: idurar_app_email,
    to: email,
    subject: 'Invoice From ' + company_name,
    reply_to: idurar_app_company_email,
    attachments: [
      {
        filename: 'Invoice.pdf',
        content: attachedFile,
      },
    ],
    html: SendInvoice({ name, title: 'Invoice From ' + company_name }),
  });

  return data;
};

// --- Wrap the email function with the Circuit Breaker ---
// Now if Resend API is down, the breaker opens and we stop hammering it
const emailBreaker = createEmailBreaker(rawSendEmail);

const mail = async (req, res) => {
  // Start a tracing span — this will appear in Jaeger as "send-invoice-email"
  return tracer.startActiveSpan('send-invoice-email', async (span) => {
    try {
      const { id } = req.body;

      if (!id) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'No invoice ID provided' });
        throw { name: 'ValidationError' };
      }

      // Add invoice ID to the trace so we can search for it in Jaeger
      span.setAttribute('invoice.id', id);

      const result = await InvoiceModel.findOne({
        _id: id,
        removed: false,
      }).exec();

      if (!result) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invoice not found' });
        throw { name: 'ValidationError' };
      }

      const { client } = result;
      const { name } = client;
      const email = client.email;

      span.setAttribute('invoice.client_email', email || 'none');

      if (!email) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Client has no email' });
        return res.status(403).json({
          success: false,
          result: null,
          message: 'Client has no email, add new email and try again',
        });
      }

      const modelName = 'Invoice';
      const fileId = modelName.toLowerCase() + '-' + result._id + '.pdf';
      const folderPath = modelName.toLowerCase();
      const targetLocation = `/tmp/${folderPath}/${fileId}`;

      // --- Step 1: Generate PDF (with its own tracing span) ---
      await tracer.startActiveSpan('generate-invoice-pdf', async (pdfSpan) => {
        await custom.generatePdf(
          modelName,
          { filename: folderPath, format: 'A4', targetLocation },
          result,
          async () => {
            pdfSpan.end();

            // --- Step 2: Send email via Circuit Breaker (with tracing + metrics) ---
            const endTimer = emailMetrics.startEmailTimer();

            try {
              // This goes through the Circuit Breaker!
              // If circuit is OPEN, it throws immediately without calling Resend
              const data = await emailBreaker.fire({ email, name, targetLocation });

              // Record how long it took (for Prometheus histogram)
              endTimer({ status: 'success' });

              span.setAttribute('email.resend_id', data?.id || 'unknown');

              // --- Step 3: Mark invoice as sent ---
              await InvoiceModel.findByIdAndUpdate(
                { _id: id, removed: false },
                { status: 'sent' }
              ).exec();

              span.setStatus({ code: SpanStatusCode.OK });

              return res.status(200).json({
                success: true,
                result: data?.id,
                message: `Successfully sent invoice to ${email}`,
              });
            } catch (emailError) {
              endTimer({ status: 'failure' });

              // Check if the circuit breaker rejected the request
              if (emailError.message && emailError.message.includes('Breaker is open')) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'Circuit breaker is open' });
                return res.status(503).json({
                  success: false,
                  result: null,
                  message: 'Email service is temporarily unavailable. Please try again later.',
                });
              }

              span.setStatus({ code: SpanStatusCode.ERROR, message: emailError.message });
              console.error('[sendMail] Email sending failed:', emailError.message);
              return res.status(500).json({
                success: false,
                result: null,
                message: 'Failed to send invoice email',
              });
            }
          }
        );
      });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message || 'Unknown error' });
      throw error;
    } finally {
      span.end();
    }
  });
};

module.exports = mail;
