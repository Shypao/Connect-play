# REDCOURT live schedule connection

The public schedule in `redcourt.html` calls the same-origin endpoint:

`/api/redcourt-schedule`

That serverless endpoint reads REDCOURT reservations on the server and only returns:

- court id, number, name, and maintenance state
- reservation start and end times
- generic reservation status and type

Customer names, contact information, notes, payments, player counts, and booking controls are never sent to the public page.

Configure these environment variables in the Connect&Play Vercel project:

- `REDCOURT_API_BASE_URL=https://redcourt-ui21.vercel.app`
- `REDCOURT_API_USERNAME` — the REDCOURT application username
- `REDCOURT_API_PASSWORD` — the REDCOURT application password

Redeploy after changing environment variables. The page keeps a safe preview state whenever the live service cannot be reached.

