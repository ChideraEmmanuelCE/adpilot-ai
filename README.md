# Northline

**Make the work work better.**

Northline is the working brand direction for a global business systems, automation and technology partner. The website positions the business around practical operational improvement rather than a single AI advertising product.

## Website experience
- Editorial, responsive design with a restrained visual system
- Animated light/dark theme transition with saved preference
- Mobile navigation and scroll-triggered section reveals
- Interactive capability selector and business workflow scenarios
- Engagement models: discovery and assessment, project delivery, ongoing partnership
- FAQ and project enquiry modal
- IP-based regional currency preference with manual override

## Currency behaviour
The site uses ipwho.is for an initial IP geolocation lookup. A VPN exit IP is generally the address visible to the geolocation provider, but IP-based detection is not guaranteed. Users can override the detected currency manually; that preference is stored in local browser storage and is not overwritten by later automatic detection. USD is the fallback when geolocation fails or returns an unsupported currency.

The selector sets the preferred quote currency and shows an indicative USD-to-selected-currency reference rate from ExchangeRate-API Open Access. The endpoint requires no API key, updates daily and requires attribution. The response is cached in browser storage until its next published update. Reference rates are informational only; payment providers, banks and card issuers may apply different rates, spreads or fees. No fixed service prices are published because project fees are scoped individually.

## Important launch checks
- **Northline is a proposed working name, not a cleared legal/trademark name.** Complete company-name, trademark and domain checks in the target markets before adopting it permanently.
- The contact form currently prepares an email using hello@adpilotai.com, inherited as a placeholder from the previous build. Replace this with a verified business inbox before launch.
- Review the final service list, commercial terms, delivery claims and supported markets with the team before publishing.
- No customer logos, testimonials, case-study metrics or client outcome claims are fabricated on this site. Workflow examples are explicitly illustrative.

## Current product status
This repository contains the marketing website. It does not yet implement customer accounts, a backend, production AI agents, live client integrations, or automated execution of client workflows. Those capabilities require separate implementation, authorized client access, secure credentials, testing and operational controls.

## Deploy
The website is a static page. Deploy the repository root to Vercel; index.html is the entry point and no build command is required.
