(() => {
  const STORAGE_KEY = 'loudweather.v1';
  const BROWSER_TTL_MS = 60 * 60 * 1000;        // 1h
  const IP_TTL_MS = 24 * 60 * 60 * 1000;        // 24h
  const WEATHER_TTL_MS = 10 * 60 * 1000;        // 10min
  const GEO_TIMEOUT_MS = 5000;

  const COPY = {
    scorching: { spicy: "bitumen-melting bullshit", clean: "an absolute scorcher", emoji: "🥵" },
    sunny:     { spicy: "ripper of a day", clean: "beaut day", emoji: "☀️" },
    cloudy:    { spicy: "day's wearing a grey hoody", clean: "a bit grey", emoji: "☁️" },
    foggy:     { spicy: "cloud's come down for a chat", clean: "proper foggy", emoji: "🌫️" },
    drizzle:   { spicy: "spittin' a bit", clean: "drizzly out", emoji: "🌦️" },
    rain:      { spicy: "pissin' down", clean: "bucketing down", emoji: "🌧️" },
    snow:      { spicy: "white as a tradies' ute", clean: "proper snowy", emoji: "❄️" },
    storm:     { spicy: "absolutely going off", clean: "a cracker of a storm", emoji: "⛈️" },
    freezing:  { spicy: "fridge weather", clean: "freezing your socks off", emoji: "🥶" },
    clearNight:{ spicy: "stars are out, lights are off", clean: "clear night sky", emoji: "🌙" },
  };

  const NIGHT_SUFFIX = { spicy: "pitch fkn black", clean: "and the sun's clocked off" };

  const WMO_LABELS = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "rime fog",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow",
    77: "snow grains",
    80: "rain showers", 81: "rain showers", 82: "violent showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm w/ hail", 99: "thunderstorm w/ hail",
  };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveState(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function bucketFor(code, tempC) {
    if (typeof tempC === 'number') {
      if (tempC >= 35) return 'scorching';
      if (tempC <= 2) return 'freezing';
    }
    if (code === 0 || code === 1) return 'sunny';
    if (code === 2 || code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'foggy';
    if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([95, 96, 99].includes(code)) return 'storm';
    return 'cloudy';
  }

  function getCachedCoords(state) {
    const c = state.lastCoords;
    if (!c) return null;
    const age = Date.now() - c.ts;
    if (c.source === 'browser' && age < BROWSER_TTL_MS) return c;
    if (c.source === 'ip' && age < IP_TTL_MS) return c;
    return null;
  }

  function browserGeo() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          city: null,
          source: 'browser',
          ts: Date.now(),
        }),
        (err) => reject(err),
        { timeout: GEO_TIMEOUT_MS, maximumAge: BROWSER_TTL_MS }
      );
    });
  }

  async function ipGeo() {
    const r = await fetch('https://ipapi.co/json/');
    if (!r.ok) throw new Error('ipapi failed: ' + r.status);
    const j = await r.json();
    if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') {
      throw new Error('ipapi: no coords');
    }
    return {
      lat: j.latitude,
      lon: j.longitude,
      city: j.city || j.region || j.country_name || null,
      source: 'ip',
      ts: Date.now(),
    };
  }

  function weatherKey(lat, lon) {
    // Round to ~1km so tiny coord jitter still hits cache.
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
  }

  async function fetchWeather(lat, lon, state) {
    const key = weatherKey(lat, lon);
    const cached = state.lastWeather;
    if (cached && cached.key === key && (Date.now() - cached.ts) < WEATHER_TTL_MS) {
      return cached.data;
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('open-meteo failed: ' + r.status);
    const j = await r.json();
    if (!j.current) throw new Error('open-meteo: no current');
    state.lastWeather = { key, ts: Date.now(), data: j.current };
    saveState(state);
    return j.current;
  }

  function renderFx(bucket, isDay) {
    const fx = document.getElementById('fx');
    fx.innerHTML = '';
    const stars = !isDay;

    const addMany = (cls, n, fn) => {
      for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = cls;
        if (fn) fn(el, i);
        fx.appendChild(el);
      }
    };

    if (bucket === 'rain' || bucket === 'drizzle' || bucket === 'storm') {
      const n = bucket === 'drizzle' ? 40 : bucket === 'storm' ? 200 : 90;
      addMany('drop', n, (el) => {
        el.style.left = Math.random() * 100 + 'vw';
        if (bucket === 'storm') {
          el.style.animationDuration = (0.25 + Math.random() * 0.4) + 's';
          el.style.height = '18vh';
          el.style.width = '2.5px';
        } else {
          el.style.animationDuration = (0.5 + Math.random() * 0.8) + 's';
        }
        el.style.animationDelay = (-Math.random() * 2) + 's';
        el.style.opacity = 0.4 + Math.random() * 0.5;
      });
      if (bucket === 'storm') {
        const bolt = document.createElement('div');
        bolt.className = 'bolt';
        fx.appendChild(bolt);
      }
    }

    if (bucket === 'snow') {
      addMany('flake', 120, (el) => {
        el.textContent = Math.random() > 0.5 ? '❄' : '❅';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (5 + Math.random() * 7) + 's';
        el.style.animationDelay = (-Math.random() * 8) + 's';
        el.style.fontSize = (14 + Math.random() * 18) + 'px';
        el.style.opacity = 0.7 + Math.random() * 0.3;
      });
    }

    if (bucket === 'freezing') {
      addMany('flake', 25, (el) => {
        el.textContent = '❄';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (12 + Math.random() * 10) + 's';
        el.style.animationDelay = (-Math.random() * 12) + 's';
        el.style.fontSize = (10 + Math.random() * 8) + 'px';
        el.style.opacity = 0.4 + Math.random() * 0.3;
      });
    }

    if (bucket === 'sunny' || bucket === 'scorching') {
      const rays = document.createElement('div');
      rays.className = 'rays';
      fx.appendChild(rays);
      if (bucket === 'scorching') {
        const sh = document.createElement('div');
        sh.className = 'shimmer';
        fx.appendChild(sh);
      }
    }

    if (bucket === 'foggy') {
      const f = document.createElement('div');
      f.className = 'fog';
      fx.appendChild(f);
    }

    if (stars && bucket !== 'storm') {
      addMany('star', 80, (el) => {
        el.style.left = Math.random() * 100 + 'vw';
        el.style.top = Math.random() * 100 + 'vh';
        el.style.animationDelay = (-Math.random() * 3) + 's';
      });
    }
  }

  function render(current, city, spicy) {
    const code = current.weather_code;
    const tempC = current.temperature_2m;
    const isDay = current.is_day === 1;
    let bucket = bucketFor(code, tempC);

    // Night fully overrides sunny/scorching — clear-night bucket instead.
    const sunBucketAtNight = !isDay && (bucket === 'sunny' || bucket === 'scorching');
    if (sunBucketAtNight) bucket = 'clearNight';

    const copy = COPY[bucket];
    const mode = spicy ? 'spicy' : 'clean';
    let phrase = copy[mode];
    if (!isDay && bucket !== 'clearNight') {
      phrase += ', ' + NIGHT_SUFFIX[mode];
    }

    const bodyBucket = isDay ? bucket : 'night';
    document.body.setAttribute('data-bucket', bodyBucket);
    document.getElementById('emoji').textContent = isDay ? copy.emoji : '🌙';
    document.getElementById('phrase').textContent = phrase;

    const label = WMO_LABELS[code] || 'unknown';
    const feels = current.apparent_temperature;
    const wind = current.wind_speed_10m;
    const parts = [
      `${tempC.toFixed(1)}°C`,
      `feels ${feels.toFixed(1)}°C`,
      `wind ${wind.toFixed(0)} km/h`,
      label,
    ];
    if (city) parts.push(city);
    document.getElementById('stats-line').textContent = parts.join(' · ');

    renderFx(bucket, isDay);
  }

  function renderError(msg) {
    document.body.setAttribute('data-bucket', 'error');
    document.getElementById('emoji').textContent = '🤷';
    document.getElementById('phrase').textContent = "dunno, mate. weather's a mystery.";
    document.getElementById('stats-line').textContent = msg || 'error';
    document.getElementById('fx').innerHTML = '';
  }

  async function resolveCoords(state) {
    const cached = getCachedCoords(state);
    if (cached) return cached;

    try {
      const c = await browserGeo();
      state.lastCoords = c;
      saveState(state);
      return c;
    } catch (_) {
      const c = await ipGeo();
      state.lastCoords = c;
      saveState(state);
      return c;
    }
  }

  let currentData = null;
  let currentCity = null;

  // Test override via query string:
  //   ?bucket=rain            → force a bucket
  //   ?code=63&temp=12&day=1  → simulate raw values
  //   ?night=1                → force night
  function testOverride() {
    const p = new URLSearchParams(location.search);
    if (!p.has('bucket') && !p.has('code') && !p.has('temp') && !p.has('night')) return null;
    const bucketMap = {
      scorching: { code: 0, temp: 40 },
      sunny:     { code: 1, temp: 22 },
      cloudy:    { code: 3, temp: 18 },
      foggy:     { code: 45, temp: 12 },
      drizzle:   { code: 53, temp: 14 },
      rain:      { code: 63, temp: 12 },
      snow:      { code: 73, temp: -1 },
      storm:     { code: 95, temp: 20 },
      freezing:  { code: 0, temp: 0 },
      clearNight:{ code: 0, temp: 15, forceNight: true },
    };
    let code = p.has('code') ? Number(p.get('code')) : 0;
    let temp = p.has('temp') ? Number(p.get('temp')) : 20;
    let forceNight = false;
    if (p.has('bucket')) {
      const b = bucketMap[p.get('bucket')];
      if (b) { code = b.code; temp = b.temp; forceNight = !!b.forceNight; }
    }
    const isDay = forceNight ? 0
                : p.has('night') ? (p.get('night') === '0' ? 1 : 0)
                : p.has('day')   ? Number(p.get('day'))
                : 1;
    return {
      weather_code: code,
      temperature_2m: temp,
      apparent_temperature: temp - 1,
      wind_speed_10m: 10,
      is_day: isDay,
      relative_humidity_2m: 50,
      precipitation: 0,
    };
  }

  async function run() {
    const state = loadState();
    const fake = testOverride();
    if (fake) {
      currentData = fake;
      currentCity = 'Testville';
      render(fake, currentCity, state.spicy !== false);
      return;
    }
    try {
      const coords = await resolveCoords(state);
      const current = await fetchWeather(coords.lat, coords.lon, state);
      currentData = current;
      currentCity = coords.city;
      render(current, coords.city, state.spicy !== false);
    } catch (e) {
      renderError(e && e.message ? e.message : 'something broke');
    }
  }

  function initToggle() {
    const btn = document.getElementById('spicy-toggle');
    const state = loadState();
    const spicy = state.spicy !== false; // default true
    btn.setAttribute('aria-pressed', String(spicy));
    btn.addEventListener('click', () => {
      const s = loadState();
      const next = !(s.spicy !== false);
      s.spicy = next;
      saveState(s);
      btn.setAttribute('aria-pressed', String(next));
      if (currentData) render(currentData, currentCity, next);
    });
  }

  initToggle();
  run();
})();
