(() => {
  const $ = id => document.getElementById(id);
  const API = window.INVITE_API || '';
  const still = document.documentElement.classList.contains('still');
  const PARTY = new Date('2027-01-23T19:00:00+11:00');

  /* ---------- Backend (Apps Script). Without a URL, a local stand-in with two test invites. ---------- */

  const DIETARY = ['None', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten free', 'Dairy free', 'Halal', 'Other'];
  const MOCK = { 'alex-testguest': ['Alex Testguest'], 'jordan-and-sam': ['Jordan Testguest', 'Sam Plusone'] };
  const mockReplies = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function getInvite(slug) {
    if (!API) {
      await wait(250);
      const guests = MOCK[slug];
      return guests ? { ok: true, invite: { guests, rsvp: mockReplies[slug] || null, open: new Date() <= new Date('2026-12-31T23:59:59+11:00'), dietary: DIETARY } } : { ok: false, error: 'not_found' };
    }
    return (await fetch(API + '?' + new URLSearchParams({ slug }))).json();
  }

  async function sendReply(slug, guests, song, notes, email) {
    if (!API) {
      await wait(700);
      if (mockReplies[slug]) return { ok: false, error: 'already_replied', invite: { guests: MOCK[slug], rsvp: mockReplies[slug] } };
      mockReplies[slug] = { guests, song, notes, email };
      return { ok: true, invite: { guests: MOCK[slug], rsvp: mockReplies[slug] } };
    }
    // text/plain keeps this a simple request, so the browser skips the CORS preflight Apps Script can't answer.
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ slug, guests, song, notes, email }) });
    return res.json();
  }

  /* ---------- Who is this for: /<slug> on the live site, #<slug> only in previews without a path. ---------- */

  function slugFromPath() {
    // The site may live in a folder or at a domain's root: whatever comes after the folder this
    // script was loaded from is the guest's link name.
    const script = document.querySelector('script[src$="site.js"]');
    const base = script ? new URL('.', script.src).pathname : '/';
    const rest = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : '';
    const parts = rest.split('/').filter(p => p && p !== 'index.html');
    return decodeURIComponent(parts[0] || '').toLowerCase();
  }
  const pathSlug = slugFromPath();
  function readSlug() {
    if (pathSlug) return pathSlug; // a #fragment on a real link never changes whose invitation it is
    return decodeURIComponent(location.hash.replace(/^#/, '')).toLowerCase();
  }
  if (!pathSlug) addEventListener('hashchange', () => location.reload());

  /* ---------- Names, instantly: guests.js carries every invitation's names, each encrypted with its own
     link name, so the greeting needs no round trip to Google. The Sheet stays the source of truth. ---------- */

  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function localNames(slug) {
    try {
      const table = window.GUESTS, subtle = window.crypto && crypto.subtle;
      if (!table || !subtle || !slug) return null;
      const enc = new TextEncoder();
      const id = hex(await subtle.digest('SHA-256', enc.encode('id:' + slug))).slice(0, 16);
      if (!table[id]) return null;
      const raw = Uint8Array.from(atob(table[id]), c => c.charCodeAt(0));
      const key = await subtle.importKey('raw', await subtle.digest('SHA-256', enc.encode('key:' + slug)), 'AES-GCM', false, ['decrypt']);
      const plain = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (err) { return null; }
  }

  const firstName = n => (/'s\b/.test(n) ? n : n.split(/\s+/)[0]);
  const joinNames = list => (list.length > 1 ? list.slice(0, -1).join(', ') + ' & ' + list[list.length - 1] : list[0]);

  const slug = readSlug();
  let invite = null;

  function lock() {
    $('locked').hidden = false;
    $('film').hidden = true;
  }

  // Apps Script can take a few seconds to wake, so the reply card says it is loading, and offers a retry if it fails.
  const greet = names => { $('greeting').textContent = 'Dear ' + joinNames(names.map(firstName)); };
  let greeted = false;

  function load() {
    $('rsvpStatus').hidden = false;
    $('rsvpStatusText').textContent = 'Loading your invitation';
    $('rsvpRetry').hidden = true;
    getInvite(slug).then(r => {
      if (!r.ok) return lock();
      invite = r.invite;
      if (!greeted || $('greeting').textContent !== 'Dear ' + joinNames(invite.guests.map(firstName))) greet(invite.guests);
      greeted = true;
      $('rsvpStatus').hidden = true;
      renderRsvp();
    }).catch(() => {
      if (!invite) $('greeting').textContent = 'Dear friends';
      $('rsvpStatusText').textContent = 'We couldn’t load your reply card. Check your connection and try again.';
      $('rsvpRetry').hidden = false;
    });
  }
  $('rsvpRetry').addEventListener('click', load);

  if (!slug) lock();
  else {
    localNames(slug).then(names => { if (names && !greeted) { greet(names); greeted = true; } });
    load();
  }

  /* ---------- Countdown ---------- */

  const daysLeft = Math.ceil((PARTY - Date.now()) / 864e5);
  if (daysLeft <= 0) $('countdown').hidden = true;
  else {
    $('days').textContent = daysLeft;
    $('daysLabel').textContent = daysLeft === 1 ? 'day to go' : 'days to go';
  }

  /* ---------- Add to calendar (.ics) ---------- */

  $('calBtn').addEventListener('click', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salwa and Marchi//Engagement//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:engagement-20270123@salwa-marchi',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART:20270123T080000Z', 'DTEND:20270123T120000Z',
      'SUMMARY:Salwa & Marchi engagement',
      'LOCATION:La Riviera Restaurant & Bar\\, 170 Phillip St\\, Sydney NSW 2000',
      'DESCRIPTION:Dress code: cocktail\\, in darker tones. Please avoid white and brown (our colours)\\, and anything bright or summery. 50m from Martin Place Station.',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'salwa-marchi-engagement.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  /* ---------- RSVP: one reply per invite, every named guest answered together ---------- */

  const answers = [];
  let replied = false;

  /* ---------- Reply button: appears once the opening has passed, hides at and after the reply card, and after replying ---------- */

  const float = $('replyFloat');
  let rsvpInView = false;
  function floatButton() {
    const show = !replied && !rsvpInView && scrollY > innerHeight * 1.2 && !$('rsvpForm').hidden && $('rsvp').getBoundingClientRect().top > 0;
    float.hidden = false;
    float.classList.toggle('show', show);
    float.tabIndex = show ? 0 : -1;
    float.setAttribute('aria-hidden', String(!show));
  }
  new IntersectionObserver(([e]) => { rsvpInView = e.isIntersecting; floatButton(); }, { threshold: .15 }).observe($('rsvp'));
  addEventListener('scroll', floatButton, { passive: true });
  float.addEventListener('click', () => {
    if (window.__lenis) window.__lenis.scrollTo('#rsvp', { offset: -24, duration: 1.6 });
    else $('rsvp').scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
  });

  const remeasure = () => { if (window.ScrollTrigger) requestAnimationFrame(() => ScrollTrigger.refresh()); };
  const animate = !still && !!window.gsap;

  // Opens or closes a block by easing its height, so the page below glides instead of jumping.
  function reveal(el, open) {
    if (open === !el.hidden) return;
    if (!animate) { el.hidden = !open; return remeasure(); }
    gsap.killTweensOf(el);
    if (open) {
      el.hidden = false;
      gsap.fromTo(el, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: .7, ease: 'expo.out', clearProps: 'height,opacity,visibility', onComplete: remeasure });
    } else {
      gsap.to(el, { height: 0, autoAlpha: 0, duration: .45, ease: 'power3.inOut', onComplete: () => { el.hidden = true; gsap.set(el, { clearProps: 'height,opacity,visibility' }); remeasure(); } });
    }
  }

  // FAQ answers ease open and closed.
  document.querySelectorAll('.faq details').forEach(d => {
    const summary = d.querySelector('summary'), body = document.createElement('div');
    body.className = 'faq-a';
    while (summary.nextSibling) body.appendChild(summary.nextSibling);
    d.appendChild(body);
    if (!animate) return;
    summary.addEventListener('click', e => {
      e.preventDefault();
      gsap.killTweensOf(body);
      if (d.open && !d.classList.contains('is-closing')) {
        d.classList.add('is-closing');
        gsap.to(body, { height: 0, autoAlpha: 0, duration: .45, ease: 'power3.inOut', onComplete: () => { d.open = false; d.classList.remove('is-closing'); gsap.set(body, { clearProps: 'height,opacity,visibility' }); remeasure(); } });
      } else {
        d.classList.remove('is-closing');
        d.open = true;
        gsap.fromTo(body, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: .7, ease: 'expo.out', clearProps: 'height,opacity,visibility', onComplete: remeasure });
      }
    });
  });

  function renderRsvp() {
    if (invite.rsvp) return showSent(invite.rsvp);
    if (!invite.open) { $('rsvpForm').hidden = true; $('closedNote').hidden = false; return; }
    $('rsvpFields').hidden = false;
    const box = $('guests');
    invite.guests.forEach((name, i) => {
      answers[i] = { name, attending: null, dietary: 'None', allergies: '' };
      const row = document.createElement('div');
      row.className = 'guest';
      row.innerHTML = `
        <p class="name">${name.replace(/[<>&]/g, '')}</p>
        <div class="choice" role="group" aria-label="Is ${name.replace(/[<>&"]/g, '')} coming?">
          <button type="button" aria-pressed="false" data-v="yes">Coming</button>
          <button type="button" aria-pressed="false" data-v="no">Can’t make it</button>
        </div>
        <div class="needs" hidden>
          <div class="field">
            <label class="caps" for="diet${i}">Dietary needs</label>
            <select class="select" id="diet${i}">${(invite.dietary || DIETARY).map(d => `<option>${d}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label class="caps" for="allergy${i}">Allergies</label>
            <input class="line" id="allergy${i}" type="text" maxlength="200" placeholder="e.g. peanuts, shellfish" autocomplete="off">
          </div>
        </div>`;
      row.querySelector('.choice').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        answers[i].attending = b.dataset.v === 'yes';
        row.querySelectorAll('.choice button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        reveal(row.querySelector('.needs'), answers[i].attending);
        $('send').disabled = answers.some(a => a.attending === null);
        $('formNote').textContent = '';
        fitToAnswers();
      });
      row.querySelector('select').addEventListener('change', e => { answers[i].dietary = e.target.value; });
      row.querySelector('input').addEventListener('input', e => { answers[i].allergies = e.target.value; });
      box.appendChild(row);
    });
    remeasure();
  }

  // When nobody on the invitation is coming there is no song to request, and the note becomes a message.
  function fitToAnswers() {
    const answered = answers.every(a => a.attending !== null);
    const anyoneComing = answers.some(a => a.attending);
    $('songField').hidden = answered && !anyoneComing;
    $('notesLabel').textContent = answered && !anyoneComing ? 'Leave Salwa & Marchi a message' : 'Anything else we should know?';
    remeasure();
  }

  $('rsvpForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (answers.some(a => a.attending === null)) return;
    const send = $('send');
    send.disabled = true;
    send.textContent = 'Sending';
    $('formNote').textContent = '';
    const guests = answers.map(a => ({ name: a.name, attending: a.attending, dietary: a.attending ? a.dietary : 'None', allergies: a.attending ? a.allergies.trim() : '' }));
    let r;
    const email = $('email').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      send.disabled = false; send.textContent = 'Send RSVP';
      $('formNote').textContent = 'Check your email address, or leave it blank.';
      $('email').focus();
      return;
    }
    const song = guests.some(g => g.attending) ? $('song').value.trim() : '';
    try { r = await sendReply(slug, guests, song, $('notes').value.trim(), email); } catch (err) { r = { ok: false, error: 'network' }; }
    if (r.ok || r.error === 'already_replied') return showSent(r.invite.rsvp, true);
    send.disabled = false;
    send.textContent = 'Send RSVP';
    $('formNote').textContent = r.error === 'closed'
      ? 'Replies have closed. Please message Salwa or Marchi.'
      : 'Your reply didn’t send. Check your connection and try again.';
  });

  function showSent(rsvp, animate) {
    replied = true;
    floatButton();
    const coming = rsvp.guests.filter(g => g.attending);
    $('rsvpForm').hidden = true;
    $('rsvpBy').hidden = true;
    $('rsvpTitle').textContent = coming.length ? 'See you there' : 'We’ll miss you';
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const needs = g => [g.dietary && g.dietary !== 'None' ? g.dietary.toLowerCase() : '', g.allergies ? 'allergic to ' + esc(g.allergies) : ''].filter(Boolean).join(', ');
    $('sentList').innerHTML = rsvp.guests.map(g => `<li>${esc(g.name)}: ${g.attending ? 'coming' + (needs(g) ? ', ' + needs(g) : '') : 'can’t make it'}</li>`).join('')
      + (rsvp.song ? `<li>Song request: ${esc(rsvp.song)}</li>` : '');
    $('sentLine').innerHTML = (rsvp.email ? 'A confirmation is on its way to <span class="as-typed">' + esc(rsvp.email) + '</span>. ' : 'Thank you for letting us know. ') + 'Need to change something? Message Salwa or Marchi.';
    $('sent').hidden = false;
    remeasure();
    if (animate && !still) gsap.from('#sent > *', { autoAlpha: 0, y: 24, duration: 1.1, stagger: .1, ease: 'expo.out' });
  }

  /* ---------- The film ---------- */

  if (still || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Smooth wheel scrolling on desktop; phones keep their own native scroll.
  const lenis = window.__lenis = new Lenis({ lerp: .09, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  const HIDE = 'inset(-40% 102% -60% -12%)', SHOW = 'inset(-40% -12% -60% -12%)';
  const write = (el, vars) => gsap.fromTo(el, { clipPath: HIDE }, { clipPath: SHOW, ease: 'power2.inOut', ...vars });

  // Opening: plays by itself on arrival, so the first screen says everything without any scrolling.
  gsap.set(['#shotTitle .write', '#shotNames .write'], { clipPath: HIDE });
  gsap.set(['#shotNames .caps', '#cue'], { autoAlpha: 0, y: 14 });
  gsap.timeline({ delay: .3, defaults: { ease: 'power2.inOut' } })
    .to('#stagePhoto', { opacity: 1, scale: 1, duration: 3.2, ease: 'power2.out' }, 0)
    .to('#stageTone', { opacity: 0, duration: 3.2, ease: 'power1.inOut' }, .4)
    .to('#shotTitle .were', { clipPath: SHOW, duration: 1.2 }, .5)
    .to('#shotTitle .eng', { clipPath: SHOW, duration: 1.4 }, 1.4)
    .to('#shotNames .write', { clipPath: SHOW, duration: 1.2 }, 2.6)
    .to('#shotNames .caps', { autoAlpha: 1, y: 0, duration: 1, stagger: .12, ease: 'power3.out' }, 3.3)
    .to('#cue', { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out' }, 3.9);

  /* ---------- The stack: each card holds while the next slides over it ---------- */

  const cards = [$('opening'), ...document.querySelectorAll('#chapters .card')];

  // A card taller than the screen holds once its bottom meets the bottom of the screen.
  function setStick() {
    cards.forEach(c => {
      const extra = Math.max(0, c.offsetHeight - innerHeight);
      c.style.setProperty('--stick', -extra + 'px');
      c.style.setProperty('--origin', extra + innerHeight / 2 + 'px'); // sink towards the middle of what is on screen
    });
  }
  setStick();
  ScrollTrigger.addEventListener('refreshInit', setStick);

  // Where a card sits in the page before it sticks: sticky elements report their stuck position,
  // so measure from the stack's own start and the heights of the cards before it.
  function flowTop(card) {
    const chapters = $('chapters');
    if (card === cards[0]) return $('opening').parentNode.getBoundingClientRect().top + scrollY;
    let y = chapters.getBoundingClientRect().top + scrollY;
    for (const c of chapters.children) {
      y += parseFloat(getComputedStyle(c).marginTop) || 0;
      if (c === card) break;
      y += c.offsetHeight;
    }
    return y;
  }

  // As the next card rises, the one beneath darkens and sinks back slightly.
  cards.slice(0, -1).forEach((card, i) => {
    const next = cards[i + 1];
    const range = { start: () => flowTop(next) - innerHeight, end: () => flowTop(next), scrub: true, invalidateOnRefresh: true };
    gsap.fromTo(card, { scale: 1 }, { scale: .93, ease: 'none', scrollTrigger: { trigger: next, ...range } });
    gsap.fromTo(card.querySelector('.card-shade'), { opacity: 0 }, { opacity: .6, ease: 'none', scrollTrigger: { trigger: next, ...range } });
  });

  // Chapter one: as its card slides up, the photograph settles into its frame and warms to colour.
  {
    const range = { trigger: '#chOne', start: () => flowTop($('chOne')) - innerHeight, end: () => flowTop($('chOne')), scrub: true, invalidateOnRefresh: true };
    gsap.fromTo('#chOneFrame img', { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: range });
    gsap.fromTo('#chOneFrame .tone', { opacity: 1 }, { opacity: 0, ease: 'none', scrollTrigger: range });
    gsap.fromTo('#chOneText > *', { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: 1.2, stagger: .09, ease: 'expo.out',
      scrollTrigger: { trigger: '#chOne', start: () => flowTop($('chOne')) - innerHeight * .35, once: true, invalidateOnRefresh: true } });
  }

  // Chapter two: each print is laid on the table as it arrives, swinging into its angle, in quick succession.
  // Then, while it passes, the photograph inside settles and warms from oxblood to full colour.
  const prints = gsap.utils.toArray('#scatter .frame');
  const tilt = f => parseFloat(getComputedStyle(f).getPropertyValue('--r')) || 0; // each print's resting angle, from the CSS
  gsap.set(prints, { autoAlpha: 0, y: 110, scale: 1.06, rotation: (i, f) => tilt(f) + (i % 2 ? 9 : -9) });
  ScrollTrigger.batch(prints, {
    start: 'top 92%', once: true,
    onEnter: batch => gsap.to(batch, { autoAlpha: 1, y: 0, scale: 1, rotation: (i, f) => tilt(f), duration: 1.3, stagger: .14, ease: 'expo.out', overwrite: true }),
  });
  prints.forEach(f => {
    const range = { trigger: f, start: 'top bottom', end: 'bottom 45%', scrub: true };
    gsap.fromTo(f.querySelector('img'), { scale: 1.18 }, { scale: 1, ease: 'none', scrollTrigger: range });
    gsap.fromTo(f.querySelector('.tone'), { opacity: .85 }, { opacity: 0, ease: 'none', scrollTrigger: { ...range, end: 'center 55%' } });
  });

  // Chapter three: the title writes itself.
  write('#chThree .write', { duration: 1.6, scrollTrigger: { trigger: '#chThree .chapter-head', start: 'top 78%', once: true } });

  // The evening: heading writes on, the rest rises in, one part after another.
  write('#evening .write', { duration: 1.6, scrollTrigger: { trigger: '#evening h2', start: 'top 80%', once: true } });
  write('#faq .write', { duration: 1.4, scrollTrigger: { trigger: '#faq h2', start: 'top 82%', once: true } });

  // Everything marked data-rise arrives once, its children staggered.
  gsap.utils.toArray('[data-rise]').forEach(el => {
    const parts = el.children.length > 1 ? el.children : el;
    gsap.from(parts, { autoAlpha: 0, y: 32, duration: 1.2, stagger: .09, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  // Countdown: the number counts up to today's figure.
  if (daysLeft > 0) {
    const n = { v: 0 };
    gsap.to(n, {
      v: daysLeft, duration: 1.8, ease: 'power3.out',
      onUpdate: () => { $('days').textContent = Math.round(n.v); },
      scrollTrigger: { trigger: '#evening .when', start: 'top 85%', once: true },
    });
  }


  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
