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

  async function sendReply(slug, guests, song, notes) {
    if (!API) {
      await wait(700);
      if (mockReplies[slug]) return { ok: false, error: 'already_replied', invite: { guests: MOCK[slug], rsvp: mockReplies[slug] } };
      mockReplies[slug] = { guests, song, notes };
      return { ok: true, invite: { guests: MOCK[slug], rsvp: mockReplies[slug] } };
    }
    // text/plain keeps this a simple request, so the browser skips the CORS preflight Apps Script can't answer.
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ slug, guests, song, notes }) });
    return res.json();
  }

  /* ---------- Who is this for: /<slug> on the live site, #<slug> in previews. ---------- */

  function readSlug() {
    const fromHash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (fromHash) return fromHash.toLowerCase();
    const parts = location.pathname.split('/').filter(p => p && p !== 'index.html');
    if (location.hostname.endsWith('github.io')) parts.shift(); // project site lives under /engagement/
    return (parts[0] || '').toLowerCase();
  }
  addEventListener('hashchange', () => location.reload());

  const firstName = n => (/'s\b/.test(n) ? n : n.split(/\s+/)[0]);
  const joinNames = list => (list.length > 1 ? list.slice(0, -1).join(', ') + ' & ' + list[list.length - 1] : list[0]);

  const slug = readSlug();
  let invite = null;

  function lock() {
    $('locked').hidden = false;
    $('film').hidden = true;
  }

  // Apps Script can take a few seconds to wake, so the reply card says it is loading, and offers a retry if it fails.
  function load() {
    $('rsvpStatus').hidden = false;
    $('rsvpStatusText').textContent = 'Loading your invitation';
    $('rsvpRetry').hidden = true;
    getInvite(slug).then(r => {
      if (!r.ok) return lock();
      invite = r.invite;
      $('greeting').textContent = 'Dear ' + joinNames(invite.guests.map(firstName));
      if (!still) gsap.fromTo('#greeting', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.4, ease: 'power3.out' });
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
  else load();

  /* ---------- Countdown ---------- */

  const daysLeft = Math.ceil((PARTY - Date.now()) / 864e5);
  if (daysLeft <= 0) $('countdown').hidden = true;
  else {
    $('days').textContent = daysLeft;
    $('daysLabel').textContent = daysLeft === 1 ? 'Day to go' : 'Days to go';
  }

  /* ---------- Add to calendar (.ics) ---------- */

  $('calBtn').addEventListener('click', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salwa and Marchi//Engagement//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:engagement-20270123@salwa-marchi',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART:20270123T080000Z', 'DTEND:20270123T130000Z',
      'SUMMARY:Salwa & Marchi engagement',
      'LOCATION:La Riviera Restaurant & Bar\\, 170 Phillip St\\, Sydney NSW 2000',
      'DESCRIPTION:Dress code: chic cocktail. 50m from Martin Place Station.',
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

  /* ---------- Reply button: appears once the opening has passed, hides at the reply card and after replying ---------- */

  const float = $('replyFloat');
  let rsvpInView = false;
  function floatButton() {
    const show = !replied && !rsvpInView && scrollY > innerHeight * 1.2 && !$('rsvpForm').hidden;
    float.hidden = false;
    float.classList.toggle('show', show);
    float.tabIndex = show ? 0 : -1;
    float.setAttribute('aria-hidden', String(!show));
  }
  new IntersectionObserver(([e]) => { rsvpInView = e.isIntersecting; floatButton(); }, { threshold: .15 }).observe($('rsvp'));
  addEventListener('scroll', floatButton, { passive: true });
  float.addEventListener('click', e => {
    if (!window.__lenis) return;
    e.preventDefault();
    window.__lenis.scrollTo('#rsvp', { offset: -24, duration: 1.6 });
  });

  const remeasure = () => { if (window.ScrollTrigger) requestAnimationFrame(() => ScrollTrigger.refresh()); };

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
        <p class="name">${firstName(name).replace(/[<>&]/g, '')}</p>
        <div class="choice" role="group" aria-label="Is ${firstName(name).replace(/[<>&"]/g, '')} coming?">
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
        row.querySelector('.needs').hidden = !answers[i].attending;
        remeasure();
        $('send').disabled = answers.some(a => a.attending === null);
        $('formNote').textContent = '';
      });
      row.querySelector('select').addEventListener('change', e => { answers[i].dietary = e.target.value; });
      row.querySelector('input').addEventListener('input', e => { answers[i].allergies = e.target.value; });
      box.appendChild(row);
    });
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
    try { r = await sendReply(slug, guests, $('song').value.trim(), $('notes').value.trim()); } catch (err) { r = { ok: false, error: 'network' }; }
    if (r.ok || r.error === 'already_replied') return showSent(r.invite.rsvp, true);
    send.disabled = false;
    send.textContent = 'Send reply';
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
    $('sentList').innerHTML = rsvp.guests.map(g => `<li>${esc(firstName(g.name))}: ${g.attending ? 'coming' + (needs(g) ? ', ' + needs(g) : '') : 'can’t make it'}</li>`).join('')
      + (rsvp.song ? `<li>Song request: ${esc(rsvp.song)}</li>` : '');
    $('sentLine').textContent = 'Thank you for letting us know. Need to change something? Message Salwa or Marchi.';
    $('sent').hidden = false;
    remeasure();
    if (animate && !still) gsap.from('#sent > *', { opacity: 0, y: 20, duration: 1, stagger: .1, ease: 'power3.out' });
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

  // Opening: one line per screen while the photograph warms in behind.
  gsap.set(['#shotTitle', '#shotNames'], { autoAlpha: 1 });
  gsap.set(['#shotTitle .write', '#shotNames .write'], { clipPath: HIDE });
  gsap.set('#shotNames .caps', { autoAlpha: 0, y: 16 });
  gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#opening', start: 'top top', end: '+=260%', pin: true, scrub: .6, anticipatePin: 1 },
  })
    .to('#cue', { autoAlpha: 0, duration: .3 }, 0)
    .to('#shotGreet', { autoAlpha: 0, y: -24, duration: .8 }, 0)
    .to('#stagePhoto', { opacity: .45, scale: 1.12, duration: 1.6 }, 0)
    .to('#shotTitle .were', { clipPath: SHOW, duration: 1.2, ease: 'power1.inOut' }, .7)
    .to('#shotTitle .eng', { clipPath: SHOW, duration: 1.4, ease: 'power1.inOut' }, 1.8)
    .to({}, { duration: .8 })
    .addLabel('lift')
    .to('#shotTitle', { autoAlpha: 0, yPercent: -18, duration: 1 }, 'lift')
    .to('#stagePhoto', { opacity: 1, scale: 1, duration: 2.2 }, 'lift')
    .to('#stageTone', { opacity: 0, duration: 2.2 }, 'lift')
    .to('#shotNames .write', { clipPath: SHOW, duration: 1.4, ease: 'power1.inOut' }, 'lift+=.7')
    .to('#shotNames .caps', { autoAlpha: 1, y: 0, duration: .8 }, '>-.2')
    .to({}, { duration: 1 });

  // Light chapters: the paper (and a lighter vignette) fades in as the chapters arrive and out as they end.
  if (document.documentElement.classList.contains('light-chapters')) {
    // refreshPriority -1: measured after the pinned sections, whose extra scroll length moves these points.
    const into = { trigger: '#chapters', start: 'top 80%', end: 'top 20%', scrub: true, refreshPriority: -1 };
    const out = { trigger: '#chapters', start: 'bottom 35%', end: 'bottom top', scrub: true, refreshPriority: -1 };
    gsap.fromTo('#paper', { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: into });
    gsap.fromTo('#paper', { opacity: 1 }, { opacity: 0, ease: 'none', immediateRender: false, scrollTrigger: out });
    gsap.fromTo('#vignette', { opacity: 1 }, { opacity: .25, ease: 'none', scrollTrigger: into });
    gsap.fromTo('#vignette', { opacity: .25 }, { opacity: 1, ease: 'none', immediateRender: false, scrollTrigger: out });
  }

  // Chapter one: the photograph fills the screen, then settles into its frame as the words arrive.
  gsap.timeline({
    scrollTrigger: { trigger: '#chOne .pin', start: 'top top', end: '+=160%', pin: true, scrub: .6, invalidateOnRefresh: true },
  })
    .fromTo('#chOneFrame', { scale: () => chOneStart().s, y: () => chOneStart().y }, { scale: 1, y: 0, ease: 'power2.inOut', duration: 1 })
    .fromTo('#chOneFrame .tone', { opacity: 1 }, { opacity: 0, duration: .8, ease: 'none' }, .2)
    .fromTo('#chOneText > *', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, stagger: .15, duration: .5, ease: 'power2.out' }, .65);

  // Where the frame must start to fill the pinned screen: measured from layout, never from the
  // transformed box, so a refresh mid-scroll can't compound the offset.
  function chOneStart() {
    const pin = document.querySelector('#chOne .pin'), f = $('chOneFrame'), t = $('chOneText');
    const gap = parseFloat(getComputedStyle(pin).rowGap) || 0;
    const top = (pin.offsetHeight - (f.offsetHeight + gap + t.offsetHeight)) / 2;
    return {
      s: Math.max(innerWidth / f.offsetWidth, innerHeight / f.offsetHeight) * 1.02,
      y: innerHeight / 2 - (top + f.offsetHeight / 2),
    };
  }

  // Each photograph warms from oxblood to full colour as it reaches the middle of the screen.
  gsap.utils.toArray('.chapter:not(.ch-one) .frame .tone').forEach(t => {
    gsap.fromTo(t, { opacity: 1 }, { opacity: 0, ease: 'none', scrollTrigger: { trigger: t.parentNode, start: 'top 85%', end: 'center 50%', scrub: true } });
  });

  // Chapter two: the scattered photographs drift at different speeds as they pass.
  const SPEEDS = [40, 110, 60, 130, 50, 100, 70, 140, 60, 120, 80];
  gsap.utils.toArray('#scatter .frame').forEach((f, i) => {
    const d = SPEEDS[i % SPEEDS.length];
    gsap.fromTo(f, { y: d }, { y: -d, ease: 'none', scrollTrigger: { trigger: f, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Chapter three: the title writes itself.
  write('#chThree .write', { duration: 1.6, scrollTrigger: { trigger: '#chThree .chapter-head', start: 'top 78%', once: true } });

  // The evening: heading writes on, the rest rises in, one part after another.
  write('#evening .write', { duration: 1.6, scrollTrigger: { trigger: '#evening h2', start: 'top 80%', once: true } });
  write('#faq .write', { duration: 1.4, scrollTrigger: { trigger: '#faq h2', start: 'top 82%', once: true } });

  // Everything marked data-rise arrives once, its children staggered.
  gsap.utils.toArray('[data-rise]').forEach(el => {
    const parts = el.children.length > 1 ? el.children : el;
    gsap.from(parts, { autoAlpha: 0, y: 28, duration: 1.2, stagger: .09, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 86%', once: true } });
  });

  // Countdown: the number counts up to today's figure.
  if (daysLeft > 0) {
    const n = { v: 0 };
    gsap.to(n, {
      v: daysLeft, duration: 2.2, ease: 'power3.out',
      onUpdate: () => { $('days').textContent = Math.round(n.v); },
      scrollTrigger: { trigger: '#countdown', start: 'top 75%', once: true },
    });
    gsap.from('#days', { autoAlpha: 0, scale: .92, duration: 1.6, ease: 'power3.out', scrollTrigger: { trigger: '#countdown', start: 'top 75%', once: true } });
  }

  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
