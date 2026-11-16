# Northline meeting booking — deployment setup

The site contains a modal-based booking UI and a Vercel serverless endpoint at `/api/booking`. The booking window is Monday–Friday, 08:30–18:00 Africa/Lagos, in 30-minute slots. The last start time is 17:30.

## Required: Google Calendar website OAuth

The Google Calendar connector connected in ChatGPT is separate from the website. Create a Google Cloud OAuth client for a Web application, enable the Google Calendar API, and grant offline access with the scope:

`https://www.googleapis.com/auth/calendar`

Generate a refresh token for the calendar account `chideraemmanuelokpala@gmail.com` and add these Vercel Production environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID` (optional; defaults to `primary`)

The OAuth consent screen must be configured for the intended production use. Keep all credentials server-side; never put them in index.html or a NEXT_PUBLIC variable.


## Optional: email notification to the owner

Create a Resend API key and verify the sender domain before production use. Add:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (must be a verified sender, e.g. `Northline Bookings <bookings@your-verified-domain>`)
- `BOOKING_OWNER_EMAIL` (defaults to `chideraemmanuelokpala@gmail.com`)

Google Calendar also sends the attendee's calendar invitation.

## Optional: WhatsApp notification to the owner

Configure a WhatsApp Business Cloud API phone number and an approved message template. The template must contain five body placeholders in this order: visitor name, visitor email, Lagos date/time, meeting method, meeting link / WhatsApp-call note. Add:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `OWNER_WHATSAPP_NUMBER` (international digits, no plus sign)
- `WHATSAPP_BOOKING_TEMPLATE`
- `WHATSAPP_TEMPLATE_LANGUAGE` (defaults to `en`)
- `WHATSAPP_GRAPH_VERSION` (defaults to `v23.0`)

The API sends a template message to the owner. WhatsApp Cloud API does not provide a public endpoint to schedule a WhatsApp voice call; for a WhatsApp booking, the calendar entry is created and the host must manually initiate the voice call at the agreed time.

## Behaviour and safeguards

- Availability is read from Google Calendar for each date.
- The selected slot is checked again immediately before event creation.
- Google Meet events request a conference link.
- WhatsApp calls are calendar reservations only, not an automatically dialled call.
- Email and WhatsApp owner notifications are attempted after the calendar event is created. Missing notification credentials do not cancel an otherwise confirmed calendar booking; the API returns notification delivery flags.
- Do not describe bookings as live until the Google OAuth environment variables are configured and a real end-to-end test succeeds.
- The availability check plus recheck reduces double-booking risk, but it is not an atomic lock. For high booking volume, add a persistent reservation/locking store.
