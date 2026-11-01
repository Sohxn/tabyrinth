# Production Payments Checklist

## Summary

Moving from test payments to real payments is primarily a Razorpay/Dodo and backend configuration task. The extension does not contain Razorpay or Dodo SDK code; it calls the production backend and uses the returned checkout URL and license key.

## Extension payment flow

The extension:

1. Calls `POST /api/create-payment-link` to create a checkout.
2. Opens the returned `paymentUrl`.
3. Calls `POST /api/verify-key` when the user enters the emailed license key.
4. Uses `/api/sync` after Plus activation.

Relevant files:

- `src/services/sync.ts`
- `entrypoints/sidepanel/App.tsx`
- `src/requestURLs/urls.ts`

## Production setup

Configure these outside the extension repository:

1. Switch Razorpay/Dodo from test mode to live mode.
2. Replace test API keys with live API keys.
3. Configure live webhook URLs and webhook secrets.
4. Ensure successful payments generate real license keys.
5. Confirm license keys are delivered by email.
6. Confirm `/api/verify-key` accepts and validates live keys.
7. Confirm the live price is `$10`.
8. Configure handling for refunds, failed payments, duplicate payments, and webhook retries.

## Real-money verification

Run one small real purchase and verify the complete flow:

```text
payment
  -> payment confirmation
  -> license key email
  -> key activation in the extension
  -> Plus features become available
  -> cloud sync works
```

Also verify that an invalid key is rejected and that a refunded or inactive license cannot continue using Plus features.

## Codebase finding

No obvious extension code change is required as long as the production backend preserves the current API contract.

Unrelated development configuration issue noticed:

```ts
dev: 'http:localhost:8787'
```

This likely should be:

```ts
dev: 'http://localhost:8787'
```

The malformed development URL does not affect the current production URL:

```text
https://tabworker.tabyrinth.workers.dev
```

## Worker API security before launch

The Cloudflare Worker is a public API and should not be treated as production-ready solely because webhook signatures and license authentication exist.

The Worker currently exposes:

- `POST /api/create-payment-link`
- `POST /api/razorpay-webhook`
- `POST /api/dodo-webhook`
- `POST /api/verify-key`
- `GET /api/sync`
- `POST /api/sync`
- `POST /api/dev-reset`

### Required hardening review

Before accepting real payments, review and address:

1. **Rate limiting and abuse controls**
   - Add Cloudflare/WAF rate limits per IP and endpoint.
   - Use stricter limits for payment-link creation, key verification, sync, and dev-reset.
   - Consider CAPTCHA or another abuse control for payment-link creation.
   - Monitor provider/API cost amplification.

2. **Authentication abuse**
   - Prevent brute-force license-key verification.
   - Add backoff or temporary blocking after repeated failures.
   - Confirm sync authorization cannot cross license accounts.

3. **Webhook replay and idempotency**
   - Verify Razorpay and Dodo signatures on the raw request body.
   - Make payment ID uniqueness mandatory, not only webhook-event deduplication.
   - Use an atomic claim so concurrent or replayed webhooks cannot issue multiple licenses.
   - Test webhook retries and duplicate deliveries.

4. **CORS**
   - Use exact trusted-origin matching rather than substring checks.
   - Confirm the extension ID allowlist is configured correctly in production.

5. **Error disclosure**
   - Do not return payment-provider response bodies or raw exception messages to clients.
   - Log diagnostic details server-side and return generic client errors.

6. **Input and URL validation**
   - Validate email addresses and all webhook payloads.
   - Validate checkout URLs before the extension opens them.
   - Reject unsafe schemes such as `javascript:`, `data:`, and unexpected hosts.
   - Validate synced node data before writing it to KV.

7. **Development and secret hygiene**
   - Keep `/api/dev-reset` disabled or strongly isolated in production.
   - Confirm `DEV_RESET_SECRET` is stored only as a Cloudflare secret.
   - Remove plaintext development credentials from documentation and rotate them.
   - Confirm test Razorpay credentials are not used in live mode.

8. **Monitoring and recovery**
   - Alert on unusual payment-link creation, verification failures, webhook failures, and sync traffic.
   - Track webhook retries and failed email delivery.
   - Define a procedure for refunds, disputes, accidental license issuance, and key revocation.

### Launch decision

Do not treat the first real payment as the only test. Before launch, complete a security review of the Worker and confirm:

- Rate limiting is active.
- Payment webhooks are signature-verified and idempotent.
- CORS is exact and restrictive.
- Errors do not expose provider or server details.
- Dev-reset is protected or disabled.
- Secrets are rotated and stored securely.
- Monitoring and rollback/revocation procedures are ready.

The earlier review found no confirmed signature bypass or direct account-takeover vulnerability, but it was not a production security sign-off. Missing rate limiting and abuse controls are meaningful medium-priority launch risks.
