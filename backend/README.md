# Invite backend (Google Apps Script)

Invites rows need only names: a row with Guest 1 filled and no Code gets a random Code automatically.

Bound to the **Salwa & Marchi – Invitation Backend** Sheet: https://docs.google.com/spreadsheets/d/11FqF_7zmu6lW7Ql3Z3X-k5Ma5cTioANSoRdEp73zKws/edit `Code.gs` is the whole backend.

## Deploy (once, about 5 minutes)

1. Open the Sheet, then **Extensions > Apps Script**.
2. Replace the contents of `Code.gs` with this folder's `Code.gs`. Save.
3. Select `syncSlugs` in the toolbar and click **Run**. Approve the permissions prompt. This:
   - adds a **Responses** tab with a link name per invite, like `joseph-and-noura` (type over any of them to choose your own),
   - fills the **Personal link** column on Invites (`<Site address>/<link name>`),
   - adds a **To chase** tab listing every invite with no reply yet.
4. **Deploy > New deployment > Web app**. Execute as: *Me*. Who has access: *Anyone*. Copy the `/exec` URL and put it in `window.INVITE_API` in `index.html`.
5. Reload the Sheet: an **Invitation** menu appears. Use **Make links** after adding invites, or after changing the Site address cell on Invites (row 1).

After editing `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

The Site address cell on Invites sets where links point. Until it holds a real address, links use `https://marchigerges.github.io/engagement`.

## Test guests

Run `addTestGuests` to add two test invites: Alex (solo) and Jordan with plus-one Sam. Their slugs appear in the Responses tab. Run `removeTestGuests` to delete them from Invites and Responses (Guest List rows are not touched).

## Local test

```
node backend/test/run.mjs
```

Runs `Code.gs` against an in-memory copy of the Sheet layout: link lookups, unguessable slugs, RSVP validation, lock after submit, close after 31 Dec 2026, and the writes to Responses, Invites and Guest List.
