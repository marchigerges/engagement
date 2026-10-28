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
  // The opening waits (briefly) for the guest's name, since it is the first thing on screen.
  let nameReady;
  const named = new Promise(r => { nameReady = r; });
  const greet = names => { $('greeting').textContent = 'Dear ' + joinNames(names.map(firstName)); nameReady(); };
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
      if (!invite) { $('greeting').textContent = 'Dear friends'; nameReady(); }
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
    const y = $('rsvp').getBoundingClientRect().top + scrollY - 24;
    if (window.__glide) window.__glide(y); else $('rsvp').scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
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
    if (animate && !still) gsap.from('#sent > *', { autoAlpha: 0, y: 24, duration: 1.6, stagger: .16, ease: 'expo.out' });
  }

  /* ---------- The film ---------- */

  if (still || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });


  const HIDE = 'inset(-40% 102% -60% -12%)', SHOW = 'inset(-40% -12% -60% -12%)';
  const write = (el, vars) => gsap.fromTo(el, { clipPath: HIDE }, { clipPath: SHOW, ease: 'power2.inOut', ...vars });

  // Opening, in order: first the guest, alone on red. Then their name rises to the top as the photograph
  // of the two of us fades up behind, and the invitation writes itself underneath.
  gsap.set(['#shotTitle .write', '#shotNames .write'], { clipPath: HIDE });
  gsap.set(['#shotNames .caps', '#cue'], { autoAlpha: 0, y: 14 });
  gsap.set('#shotGreet', { autoAlpha: 0 });
  gsap.set('#stagePhoto', { opacity: 0, scale: 1.14 });
  gsap.set('.scrim', { opacity: 0 });
  // Built when it starts, so the name is measured once it is on screen.
  function playOpening() {
    const r = $('shotGreet').getBoundingClientRect(), dy = innerHeight / 2 - (r.top + r.height / 2);
    const big = Math.min(1.35, (innerWidth - 32) / ($('greeting').offsetWidth || 1)); // larger while it is alone, but never wider than the screen
    gsap.timeline({ defaults: { ease: 'power2.inOut' } }).timeScale(.7) // everything in the opening plays at 70% speed
      .fromTo('#shotGreet', { autoAlpha: 0, y: dy + 18, scale: big }, { autoAlpha: 1, y: dy, duration: 1, ease: 'expo.out' }, 0)
      .to('#shotGreet', { y: 0, scale: 1, duration: 1.4, ease: 'expo.inOut' }, 1.7)
      .to('#stagePhoto', { opacity: 1, scale: 1, duration: 3, ease: 'power2.out' }, 1.8)
      .to('.scrim', { opacity: 1, duration: 2, ease: 'power1.inOut' }, 1.8)
      .to('#stageTone', { opacity: 0, duration: 3, ease: 'power1.inOut' }, 2.1)
      .to('#shotTitle .were', { clipPath: SHOW, duration: 1.2 }, 2.6)
      .to('#shotTitle .eng', { clipPath: SHOW, duration: 1.4 }, 3.4)
      .to('#shotNames .write', { clipPath: SHOW, duration: 1.2 }, 4.5)
      .to('#shotNames .caps', { autoAlpha: 1, y: 0, duration: 1, stagger: .12, ease: 'expo.out' }, 5.1)
      .to('#cue', { autoAlpha: 1, y: 0, duration: 1, ease: 'expo.out' }, 5.6);
  }
  // Start as soon as the name is known; if the name is slow, start anyway after a moment.
  Promise.race([named, new Promise(r => setTimeout(r, 1500))]).then(() => setTimeout(playOpening, 250));

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

  // Each chapter arrives on its title alone: the number tracks in, a rule draws, the title writes itself.
  // It holds for a beat, fades away, and the story rises in on the same screen.
  document.documentElement.classList.add('has-intros');
  document.querySelectorAll('#chapters .card').forEach(card => {
    const intro = card.querySelector('.chapter-intro');
    if (!intro) return;
    const num = intro.querySelector('.intro-num'), rule = intro.querySelector('.intro-rule'), title = intro.querySelector('.write');
    const story = card.id === 'chOne' ? $('chOneText').children : card.querySelectorAll('.chapter-text > :not(.aside)');
    const aside = card.querySelector('.aside'); // the punchline lands a beat after the story
    const track = k => parseFloat(getComputedStyle(num).fontSize) * k + 'px'; // GSAP mis-converts em letter-spacing, so use px
    gsap.set(title, { clipPath: HIDE });
    gsap.set(num, { autoAlpha: 0, letterSpacing: track(.7) });
    gsap.set(rule, { scaleX: 0 });
    gsap.set(story, { autoAlpha: 0, y: 24 });
    if (aside) gsap.set(aside, { autoAlpha: 0, y: 16 });
    const show = gsap.timeline({ paused: true })
      .to(num, { autoAlpha: 1, letterSpacing: track(.32), duration: .9, ease: 'expo.out' }, 0)
      .to(rule, { scaleX: 1, duration: .9, ease: 'expo.inOut' }, .1)
      .to(title, { clipPath: SHOW, duration: 1.3, ease: 'power2.inOut' }, .25)
      .to(intro, { autoAlpha: 0, duration: .7, ease: 'power2.inOut' }, 2.6)
      .to(story, { autoAlpha: 1, y: 0, duration: 1.1, stagger: .1, ease: 'expo.out' }, 2.95);
    if (aside) show.to(aside, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out' }, 4.6);
    // Chapter one: the photograph settles into its frame and warms to colour as the story appears.
    if (card.id === 'chOne') show
      .fromTo('#chOneFrame img', { scale: 1.2 }, { scale: 1, duration: 2.2, ease: 'expo.out' }, 2.75)
      .fromTo('#chOneFrame .tone', { opacity: 1 }, { opacity: 0, duration: 1.8, ease: 'power1.inOut' }, 2.75);
    ScrollTrigger.create({ trigger: card, start: () => flowTop(card) - innerHeight * .25, once: true, invalidateOnRefresh: true, onEnter: () => show.play() });
  });

  // The story moves one part at a time, like turning pages: any swipe or wheel turn, however small or hard,
  // glides to exactly the next part and stops there. Inside a part taller than the screen (the collage)
  // the page scrolls normally until its edge, and from the evening down scrolling is entirely normal.
  function parts() {
    const evening = $('evening').getBoundingClientRect().top + scrollY;
    const stops = [0], zones = [];
    cards.slice(1).forEach(c => {
      const top = flowTop(c), extra = Math.max(0, c.offsetHeight - innerHeight);
      stops.push(top);
      if (extra > 2) { stops.push(top + extra); zones.push([top, top + extra]); }
    });
    stops.push(evening);
    return { stops, zones, evening };
  }
  let turning = false, quietUntil = 0;
  function glide(target, duration = .95) {
    turning = true;
    const at = { y: scrollY };
    gsap.to(at, { y: target, duration, ease: 'power3.inOut', onUpdate: () => scrollTo(0, at.y),
      onComplete: () => { turning = false; quietUntil = performance.now() + 450; } }); // ignore the tail of a trackpad's momentum
  }
  window.__glide = y => glide(y, 1.4); // the RSVP button
  function turn(dir) {
    const { stops } = parts(), y = scrollY;
    const target = dir > 0 ? stops.find(p => p > y + 2) : [...stops].reverse().find(p => p < y - 2);
    if (target !== undefined) glide(target);
  }
  // Whether a gesture in this direction should turn the page, or be left to the browser's own scrolling.
  // Scrolling to the edge of a tall part leaves a little slack: the page holds there for a moment, so the
  // overscroll from the end of the collage does not carry straight on into the next chapter.
  let edgeHoldUntil = 0;
  const SLACK = 900;
  function paging(dir) {
    const { zones, evening } = parts(), y = scrollY;
    if (y > evening + 2) return false;                          // the evening and below scroll freely
    if (y > evening - 2) return dir < 0;                        // at the evening, only going back up turns
    const zone = zones.find(([a, b]) => y > a - 2 && y < b + 2);
    if (!zone) return true;
    const atEdge = dir < 0 ? y < zone[0] + 2 : y > zone[1] - 2; // inside a tall part, turn only at its edges
    if (atEdge && performance.now() < edgeHoldUntil) return 'hold';
    return atEdge;
  }
  let touchY = null, touchTurned = false;
  addEventListener('touchstart', e => { touchY = e.touches[0].clientY; touchTurned = false; }, { passive: true });
  addEventListener('touchmove', e => {
    if (touchY === null) return;
    const dy = touchY - e.touches[0].clientY, dir = dy > 0 ? 1 : -1;
    if (turning || touchTurned) { e.preventDefault(); return; }
    const gate = Math.abs(dy) < 4 ? false : paging(dir);
    if (!gate) return;
    e.preventDefault();
    if (gate === true && Math.abs(dy) > 24) { touchTurned = true; turn(dir); }
  }, { passive: false });
  addEventListener('touchend', () => { touchY = null; }, { passive: true });
  addEventListener('wheel', e => {
    const dir = e.deltaY > 0 ? 1 : -1;
    if (turning || performance.now() < quietUntil) { if (paging(dir) || turning) e.preventDefault(); return; }
    if (Math.abs(e.deltaY) < 2) return;
    const gate = paging(dir);
    if (gate) { e.preventDefault(); if (gate === true) turn(dir); else edgeHoldUntil = performance.now() + SLACK; return; }
    // Inside a tall part, a big wheel turn stops at the part's edge rather than flying past it.
    const { zones } = parts(), y = scrollY, zone = zones.find(([a, z]) => y > a - 2 && y < z + 2);
    if (zone && (y + e.deltaY > zone[1] || y + e.deltaY < zone[0])) { e.preventDefault(); scrollTo(0, dir > 0 ? zone[1] : zone[0]); }
  }, { passive: false });
  // A flick that coasts out of a tall part and stops between parts glides on to the next part.
  let lastY = scrollY, lastDir = 1, idle;
  addEventListener('scroll', () => {
    if (scrollY !== lastY) lastDir = scrollY > lastY ? 1 : -1;
    // Momentum or a big wheel turn that carries out of a tall part stops at its edge; the next swipe turns the page.
    if (!turning) {
      const zone = parts().zones.find(([a, z]) => lastY > a - 3 && lastY < z + 3);
      if (zone && (scrollY < zone[0] - 3 || scrollY > zone[1] + 3)) { lastY = scrollY < zone[0] ? zone[0] : zone[1]; edgeHoldUntil = performance.now() + SLACK; scrollTo(0, lastY); return; }
      if (zone && lastY > zone[0] + 3 && lastY < zone[1] - 3 && (scrollY <= zone[0] + 3 || scrollY >= zone[1] - 3)) edgeHoldUntil = performance.now() + SLACK; // reached an edge by scrolling
    }
    lastY = scrollY;
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (turning || touchY !== null) return;
      const { stops, zones, evening } = parts(), y = scrollY;
      if (y > evening - 2 || stops.some(p => Math.abs(p - y) < 3) || zones.some(([a, z]) => y > a && y < z)) return;
      turn(lastDir);
    }, 160);
  }, { passive: true });
  addEventListener('keydown', e => {
    const dir = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (!dir || /input|textarea|select|button/i.test(document.activeElement.tagName) || !paging(dir)) return;
    e.preventDefault();
    if (!turning && paging(dir) === true) turn(dir);
  });

  // Chapter two: each print is laid on the table as it arrives, swinging into its angle, in quick succession.
  // Then, while it passes, the photograph inside settles and warms from oxblood to full colour.
  const prints = gsap.utils.toArray('#scatter .frame');
  const tilt = f => parseFloat(getComputedStyle(f).getPropertyValue('--r')) || 0; // each print's resting angle, from the CSS
  gsap.set(prints, { autoAlpha: 0, y: 110, scale: 1.06, rotation: (i, f) => tilt(f) + (i % 2 ? 9 : -9) });
  ScrollTrigger.batch(prints, {
    start: 'top 92%', once: true,
    onEnter: batch => gsap.to(batch, { autoAlpha: 1, y: 0, scale: 1, rotation: (i, f) => tilt(f), duration: 1.9, stagger: .22, ease: 'expo.out', overwrite: true }),
  });
  prints.forEach(f => {
    const range = { trigger: f, start: 'top bottom', end: 'bottom 45%', scrub: true };
    gsap.fromTo(f.querySelector('img'), { scale: 1.18 }, { scale: 1, ease: 'none', scrollTrigger: range });
    gsap.fromTo(f.querySelector('.tone'), { opacity: .85 }, { opacity: 0, ease: 'none', scrollTrigger: { ...range, end: 'center 55%' } });
  });


  // The evening: heading writes on, the rest rises in, one part after another.
  write('#evening .write', { duration: 2.4, scrollTrigger: { trigger: '#evening h2', start: 'top 80%', once: true } });
  write('#faq .write', { duration: 2.2, scrollTrigger: { trigger: '#faq h2', start: 'top 82%', once: true } });

  // Everything marked data-rise arrives once, its children staggered.
  gsap.utils.toArray('[data-rise]').forEach(el => {
    const parts = el.children.length > 1 ? el.children : el;
    gsap.from(parts, { autoAlpha: 0, y: 32, duration: 1.7, stagger: .14, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  // Countdown: the number counts up to today's figure.
  if (daysLeft > 0) {
    const n = { v: 0 };
    gsap.to(n, {
      v: daysLeft, duration: 2.6, ease: 'power3.out',
      onUpdate: () => { $('days').textContent = Math.round(n.v); },
      scrollTrigger: { trigger: '#evening .when', start: 'top 85%', once: true },
    });
  }


  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
