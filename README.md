# Salwa & Marchi

The engagement invitation: one scrolling film per guest, ending in an RSVP that writes to the guest-list Sheet.

- `index.html`, `site.css`, `site.js`: the site. Photos in `img/`, GSAP, ScrollTrigger and Lenis in `vendor/`.
- `404.html`: lets personal links like `/joseph-and-noura` work on GitHub Pages. Generated; after changing `<head>` in `index.html`, run `python3 tools/make-404.py`.
- `og.jpg`: the image shown when a link is texted. Its address in `index.html` (`og:image`) must be absolute (now `https://marchilino.com/engagement/og.jpg`): update it, then regenerate `404.html`, when the custom domain is set.

Live at `https://marchilino.com/engagement/<link name>` (GitHub Pages from `main`; marchilino.com is the account's custom domain).
- `backend/`: the Google Apps Script and its local test (`node backend/test/run.mjs`). Deploy steps in `backend/README.md`; paste the `/exec` address into `window.INVITE_API` in `index.html`.

Without `INVITE_API` the site runs on two test invites: `#jordan-and-sam` and `#alex-testguest`. With it, guest data comes from the Sheet.
