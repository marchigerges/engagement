(() => {
  const $ = id => document.getElementById(id);
  const API = window.INVITE_API || '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Backend (Apps Script). Without a URL, a local stand-in with two test guests. ---------- */

  const MOCK = {
    code: 'riviera',
    invites: {
      'alex-testguest': ['Alex Testguest'],
      'jordan-sam': ['Jordan Testguest', 'Sam Plusone'],
    },
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function lookup(params) {
    if (!API) {
      await wait(350);
      const guests = MOCK.invites[params.slug];
      if (!('code' in params)) return { ok: true, exists: !!guests };
      if (!guests || params.code.trim().toLowerCase() !== MOCK.code) return { ok: false, error: 'denied' };
      return { ok: true, invite: { guests, rsvp: null, open: true } };
    }
    const res = await fetch(API + '?' + new URLSearchParams(params));
    return res.json();
  }

  /* ---------- Routing: /<slug> on the live site, #<slug> in previews. ---------- */

  function readSlug() {
    const fromHash = location.hash.replace(/^#/, '');
    if (fromHash) return decodeURIComponent(fromHash).toLowerCase();
    const parts = location.pathname.split('/').filter(p => p && p !== 'index.html');
    if (location.hostname.endsWith('github.io')) parts.shift(); // project site lives under /engagement/
    return (parts[0] || '').toLowerCase();
  }

  /* ---------- Shared invitation face (card in the envelope and the hero). ---------- */

  const FACE = `
    <p class="caps greeting" data-greeting></p>
    <h1 class="script engaged"><span class="were">We’re</span><span class="eng">Engaged</span></h1>
    <p class="caps see">And we would love to see you there</p>`;
  document.querySelectorAll('[data-face]').forEach(el => { el.innerHTML = FACE; });
  $('card').querySelector('h1').setAttribute('aria-hidden', 'true');

  function greetingFor(guests) {
    const first = guests.map(n => (/'s\b/.test(n) ? n : n.split(/\s+/)[0]));
    const names = first.length > 1 ? first.slice(0, -1).join(', ') + ' & ' + first[first.length - 1] : first[0];
    return 'Dear ' + names;
  }

  /* ---------- Wax seal: an irregular disc with an S & M monogram, drawn once and split in two. ---------- */

  function sealSVG() {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 46 + (i % 2 ? 2.2 : 0) + rand() * 2.4;
      pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p = pts[(i + 1) % n], q = pts[(i + 2) % n];
      d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2).toFixed(1)}`;
    }
    return `<svg viewBox="0 0 100 100">
      <defs>
        <radialGradient id="waxg" cx="38%" cy="32%" r="75%">
          <stop offset="0" stop-color="#c4363d"/><stop offset=".45" stop-color="#8c1117"/><stop offset="1" stop-color="#4a0307"/>
        </radialGradient>
        <radialGradient id="pressg" cx="60%" cy="65%" r="70%">
          <stop offset="0" stop-color="#a5222a"/><stop offset="1" stop-color="#7a0d13"/>
        </radialGradient>
      </defs>
      <path d="${d}" fill="url(#waxg)"/>
      <circle cx="50" cy="50" r="33" fill="url(#pressg)"/>
      <circle cx="50" cy="50" r="33" fill="none" stroke="#c4363d" stroke-opacity=".45" stroke-width="1.2" transform="translate(.6 .8)"/>
      <circle cx="50" cy="50" r="27.5" fill="none" stroke="#4a0307" stroke-opacity=".6" stroke-width=".7"/>
      <g font-family="Pinyon Script, cursive" font-size="30" text-anchor="middle">
        <text x="50.8" y="60.8" fill="#d9555b" fill-opacity=".7">S&amp;M</text>
        <text x="50" y="60" fill="#3a0205">S&amp;M</text>
      </g>
    </svg>`;
  }
  const seal = sealSVG();
  $('seal').querySelectorAll('.half, .whole').forEach(h => { h.innerHTML = seal; });

  /* ---------- Screens ---------- */

  function show(id) {
    ['locked', 'gate'].forEach(s => { $(s).hidden = s !== id; });
    if (window.gsap && !reduced) gsap.fromTo('#' + id, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'power2.out' });
  }

  const slug = readSlug();
  addEventListener('hashchange', () => location.reload());
  const fontsReady = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(1500)]);

  if (!slug) {
    fontsReady.then(() => show('locked'));
  } else {
    // Show the envelope straight away; an unknown slug swaps to the locked screen when the lookup returns.
    fontsReady.then(() => show('gate'));
    lookup({ slug }).then(r => { if (!r.exists) show('locked'); }).catch(() => {});
  }

  /* ---------- Access code ---------- */

  const form = $('codeForm'), input = $('code'), btn = $('openBtn'), tryAgain = $('tryAgain');
  let busy = false;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const code = input.value.trim();
    if (!code) { input.focus(); return; }
    busy = true;
    btn.disabled = true;
    btn.textContent = 'Opening';
    let r;
    try { r = await lookup({ slug, code }); } catch (err) { r = { ok: false }; }
    if (r.ok && r.invite) {
      input.blur();
      open(r.invite);
    } else {
      wrong();
      busy = false;
      btn.disabled = false;
      btn.textContent = 'Open';
    }
  });

  function wrong() {
    tryAgain.textContent = 'Try again';
    input.select();
    if (reduced) { tryAgain.style.opacity = 1; return; }
    gsap.timeline()
      .to(['#envelope', '#codeForm .code-row'], { keyframes: { x: [0, -9, 8, -6, 4, -2, 0] }, duration: .6, ease: 'power1.inOut' })
      .to(tryAgain, { opacity: 1, duration: .5, ease: 'power2.out' }, '<.1');
  }

  /* ---------- Opening: seal cracks, flap opens, card rises, becomes the page. ---------- */

  function open(invite) {
    const greeting = greetingFor(invite.guests);
    document.querySelectorAll('[data-greeting]').forEach(el => { el.textContent = greeting; });
    window.INVITE = invite;
    $('gate').classList.add('opening');

    const site = $('site'), gate = $('gate');
    const finish = () => {
      gate.hidden = true;
      document.documentElement.classList.remove('locked');
      window.scrollTo(0, 0);
      document.dispatchEvent(new CustomEvent('invite:open', { detail: invite }));
      startSite();
    };

    if (reduced) {
      site.hidden = false;
      prepHero();
      gsap.fromTo(site, { opacity: 0 }, { opacity: 1, duration: .4, onComplete: finish });
      gsap.to(gate, { opacity: 0, duration: .4 });
      return;
    }

    const card = $('card');
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.addLabel('crack')
      .to(form, { opacity: 0, y: 12, duration: .6, ease: 'power2.in' }, 'crack')
      .to('#envelope', { y: () => innerHeight * .1, duration: 1.4, ease: 'power3.inOut' }, 'crack')
      .to('#seal', { scale: .94, duration: .12, ease: 'power2.in' }, 'crack+=.25')
      .set('#seal .whole', { opacity: 0 })
      .to('#seal .half.l', { x: '-26%', y: '55%', rotation: -18, opacity: 0, duration: 1, ease: 'power2.in' }, '>')
      .to('#seal .half.r', { x: '24%', y: '70%', rotation: 14, opacity: 0, duration: 1, ease: 'power2.in' }, '<')

      .addLabel('flap', '-=.55')
      .to('#flapShadow', { opacity: 0, duration: .3 }, 'flap')
      .to('#flap', { rotationX: 180, duration: 1.2, ease: 'power3.inOut' }, 'flap')
      .set('#flapWrap', { zIndex: 1 }, 'flap+=.6')

      .addLabel('rise', '-=.15')
      .to(card, { y: () => -card.offsetHeight * .72, duration: 1.3, ease: 'power3.inOut' }, 'rise')

      .addLabel('drop', '-=.2')
      .to(['.env-liner', '#pocket', '#flapWrap'], { y: () => innerHeight * 1.5, duration: 1.2, ease: 'power3.in' }, 'drop')
      .to(['.env-liner', '#pocket', '#flapWrap'], { opacity: 0, duration: .5, ease: 'power1.in' }, 'drop+=.7')
      .to(card, {
        x: () => cardTarget().x,
        y: () => cardTarget().y,
        scale: () => cardTarget().s,
        duration: 1.4,
        ease: 'expo.inOut',
      }, 'drop+=.35')
      .to('#cardTint', { opacity: 0, duration: .9, ease: 'power2.inOut' }, '<.5')
      .call(() => { site.hidden = false; gsap.set(site, { opacity: 0 }); prepHero(); })
      .to(site, { opacity: 1, duration: .5, ease: 'power1.out' })
      .call(finish);
  }

  // Where the card must go so its face lands exactly on the hero frame.
  let target = null;
  function cardTarget() {
    if (target) return target;
    const card = $('card');
    const r = card.getBoundingClientRect();
    const tx = gsap.getProperty(card, 'x'), ty = gsap.getProperty(card, 'y'), ts = gsap.getProperty(card, 'scale');
    const frameW = Math.min(innerWidth, innerHeight / 1.41);
    const s = frameW / (r.width / ts);
    target = {
      s,
      x: tx + (innerWidth / 2 - (r.left + r.width / 2)),
      y: ty + (innerHeight / 2 - (r.top + r.height / 2)),
    };
    return target;
  }

  /* ---------- Hero: the words write themselves on, the photo surfaces beneath. ---------- */

  const WRITE_FROM = 'inset(-30% 102% -40% -12%)', WRITE_TO = 'inset(-30% -12% -40% -12%)';
  let heroTl = null;

  function prepHero() {
    if (reduced) return;
    gsap.set('#hero .were, #hero .eng', { clipPath: WRITE_FROM });
    gsap.set(['#heroPhoto', '#hero .see', '#scrollCue'], { opacity: 0 });
    gsap.set('#heroPhoto', { scale: 1.06, transformOrigin: '50% 100%' });
    heroTl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } })
      .to('#hero .were', { clipPath: WRITE_TO, duration: 1.3 }, 0)
      .to('#hero .eng', { clipPath: WRITE_TO, duration: 1.7 }, .95)
      .to('#heroPhoto', { opacity: .5, scale: 1, duration: 2.6, ease: 'power3.out' }, .6)
      .to('#hero .see', { opacity: 1, duration: 1.2, ease: 'power2.out' }, 2.4)
      .to('#scrollCue', { opacity: 1, duration: 1.2, ease: 'power2.out' }, 3.1);
  }

  /* ---------- Scrolling: Lenis drives ScrollTrigger; each detail arrives once. ---------- */

  function startSite() {
    if (reduced) return;
    heroTl && heroTl.play();
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: .085 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);

    // Photo sinks and fades as the hero scrolls away.
    gsap.to('#heroPhotoWrap', { yPercent: 12, opacity: .4, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('#scrollCue', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: '15% top', scrub: true } });

    // The couple's names write on like the hero; the rest rises in.
    gsap.fromTo('#details .names span', { clipPath: WRITE_FROM }, {
      clipPath: WRITE_TO, duration: 1.4, stagger: .45, ease: 'power2.inOut',
      scrollTrigger: { trigger: '#details .names', start: 'top 80%', once: true },
    });
    gsap.utils.toArray('#details [data-reveal]:not(.names)').forEach(el => {
      gsap.from(el.children, {
        y: 26, opacity: 0, duration: 1.1, stagger: .08, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
    });
  }

  /* ---------- Add to calendar (.ics) ---------- */

  $('calBtn').addEventListener('click', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Marchilino and Salwa//Engagement//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:engagement-20270123@marchilino-salwa',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART:20270123T080000Z', 'DTEND:20270123T130000Z',
      'SUMMARY:Marchilino & Salwa engagement',
      'LOCATION:La Riviera Restaurant & Bar\\, 170 Phillip St\\, Sydney NSW 2000',
      'DESCRIPTION:Dress code: chic cocktail. 50m from Martin Place Station.',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'marchilino-salwa-engagement.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
})();
