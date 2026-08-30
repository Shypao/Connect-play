# Connect & Play multi-partner portal

This package contains the existing Connect & Play marketing website, the REDCOURT customer booking page, and an interactive five-partner portal prototype.

## Preview locally

Run:

```bash
node dev-server.cjs
```

Then open:

- Main website: `http://127.0.0.1:8088/`
- Partner portal: `http://127.0.0.1:8088/partner-portal.html`
- REDCOURT booking: `http://127.0.0.1:8088/redcourt.html#booking`

## What the portal demonstrates

- One Connect & Play entry point for venue partners.
- Five sample organizations with different product subscriptions.
- Booking, Queueing, and Tournament cards enabled per organization.
- A separate workspace identity, team list, and activity view for each partner.
- Responsive layouts for phones and desktop screens.

## Important production boundary

`partner-portal.html` is a visual and interaction prototype. Its sample password is not authentication and its sample records are not persistent.

Before accepting real partner logins:

1. Add a server-side authentication provider and individual user accounts.
2. Connect the server functions to Turso using `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. Apply `database/schema.sql` to create the initial multi-tenant data model.
4. Check organization membership, user role, and module entitlement on every server request.
5. Filter every reservation, queue entry, tournament, and report by the authenticated `organization_id`.
6. Never trust an organization ID or enabled-module list sent by browser JavaScript.

The schema deliberately stores an external authentication provider ID rather than plain-text passwords. Password verification and session creation belong in server-side code.

## Existing REDCOURT booking integration

The customer booking form uses `api/customer-booking.js` as a server-side proxy to the existing REDCOURT API. Configure the values shown in `.env.example` in Vercel. Rotate any password that has previously been shared before production deployment.

## Vercel domain suggestion

- Main site: `connectandplay.ph`
- Partner portal: `app.connectandplay.ph`
- Central login later: `accounts.connectandplay.ph`

You may initially deploy the marketing site and portal in the same Vercel project. Once real authentication is built, the subdomains can still share a trusted central login flow.
