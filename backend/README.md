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

After editing `Code.gs` later, the GitHub Action below deploys it. Without it, paste the code and use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

The Site address cell on Invites sets where links point. Until it holds a real address, links use `https://salwaxmarchi.com`.

## Automatic deploys

`.github/workflows/deploy-backend.yml` runs on every push to `main` that touches `backend/`. It runs the tests, uploads only `Code.gs` and `appsscript.json` with [clasp](https://github.com/google/clasp), and updates the existing web app deployment, so the `/exec` URL never changes. Run it by hand from **Actions > Deploy backend > Run workflow**.

One-time setup:

1. Turn on the Apps Script API: https://script.google.com/home/usersettings
2. On a computer with Node installed, run `npx @google/clasp@2.4.2 login` and sign in with the Google account that owns the Sheet. It writes a `.clasprc.json` file in your home folder.
3. In the repo on GitHub, **Settings > Secrets and variables > Actions > New repository secret**:
   - `CLASPRC_JSON`: the whole contents of that `.clasprc.json` file.
   - `SCRIPT_ID`: from Apps Script, **Project Settings > IDs > Script ID**.
4. **Actions > Deploy backend > Run workflow** to check it works.

`CLASPRC_JSON` can edit your Apps Script projects: keep it only in GitHub Secrets. If the script ever needs a new permission (like sending email did), run any function once in the Apps Script editor and approve it; the Action cannot click Allow for you.

## Test guests

Run `addTestGuests` to add two test invites: Alex (solo) and Jordan with plus-one Sam. Their slugs appear in the Responses tab. Run `removeTestGuests` to delete them from Invites and Responses (Guest List rows are not touched).

## Local test

```
node backend/test/run.mjs
```

Runs `Code.gs` against an in-memory copy of the Sheet layout: link lookups, unguessable slugs, RSVP validation, lock after submit, close after 31 Dec 2026, and the writes to Responses, Invites and Guest List.
