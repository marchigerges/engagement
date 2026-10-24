# Invite backend (Google Apps Script)

Bound to the **Engagement Party Guest List** Sheet. `Code.gs` is the whole backend.

## Deploy (once, about 3 minutes)

1. Open the Sheet, then **Extensions > Apps Script**.
2. Replace the contents of `Code.gs` with this folder's `Code.gs`. Save.
3. Select `syncSlugs` in the toolbar and click **Run**. Approve the permissions prompt. A **Responses** tab appears with a personal link name per invite, like `joseph-and-noura`. Type over any of them to choose your own; each guest's link is `<site address>/<slug>`.
4. **Deploy > New deployment > Web app**. Execute as: *Me*. Who has access: *Anyone*. Copy the `/exec` URL.

After editing `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

## Test guests

Run `addTestGuests` to add two test invites: Alex (solo) and Jordan with plus-one Sam. Their slugs appear in the Responses tab. Run `removeTestGuests` to delete them from Invites and Responses (Guest List rows are not touched).

## Local test

```
node backend/test/run.mjs
```

Runs `Code.gs` against an in-memory copy of the Sheet layout: link lookups, unguessable slugs, RSVP validation, lock after submit, close after 31 Dec 2026, and the writes to Responses, Invites and Guest List.
