/**
 * Three.js 实时天时控制器（时间 × 季节 × 实时天气 × 气温 + 自然白噪音 + 放空小憩模式）
 * - 完全不依赖静态背景图片，所有参数实时驱动 Three.js 3D 天空、体积云、远山、湖水反射与四季物象
 * - 默认自动同步：真实本地时间（太阳/月亮高度角）、二十四节气、季节、以及 Open-Meteo 实时天气/气温/风速
 * - 自由漫游：支持随时手动切换「春 / 夏 / 秋 / 冬 / 雨 / 夜」或拖动 24 小时时间滑块看日出日落星河
 * - 内置 Web Audio API 0KB 自然白噪音（窗前细雨 / 林间微风 / 暖炉篝火）与一键「🎐 小憩」放空模式
 */
(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const WEATHER_CACHE_KEY = 'blog_weather_cache_v2'
  const OVERRIDE_KEY = 'blog_scene_override_v2'
  const DEFAULT_HOST = { lat: 30.2741, lng: 120.1551, city: '杭州' }

  const SCENE_META = {
    spring: { id: 'spring', icon: '🌸', label: '春樱晴野', season: 'spring', weather: 'clear', particle: 'petal' },
    summer: { id: 'summer', icon: '🌊', label: '夏海碧空', season: 'summer', weather: 'clear', particle: 'summer' },
    autumn: { id: 'autumn', icon: '🍂', label: '金秋原野', season: 'autumn', weather: 'clear', particle: 'ginkgo' },
    winter: { id: 'winter', icon: '❄️', label: '冬日晴雪', season: 'winter', weather: 'snow', particle: 'snow' },
    rain: { id: 'rain', icon: '🌧️', label: '烟雨湖山', season: 'spring', weather: 'rain', particle: 'rain' },
    night: { id: 'night', icon: '🌌', label: '星河静夜', season: 'autumn', weather: 'clear', particle: 'star' }
  }

  const REST_QUOTES = [
    '写得出就写，写不出就先吹会儿风。',
    '把喧嚣暂时关在窗外，这里的时间走得很慢。',
    '看远处的云慢慢飘过去，发呆也是正经事。',
    '在代码、风景与日常之间，留一点空白给自己。',
    '不用急着赶路，先听一会儿风声或雨声吧。',
    '那些安静停下来的时刻，后来想起来都在发光。'
  ]

  const SOLAR_TERMS = [
    [1, 5, '小寒'], [1, 20, '大寒'],
    [2, 4, '立春'], [2, 19, '雨水'],
    [3, 5, '惊蛰'], [3, 20, '春分'],
    [4, 4, '清明'], [4, 20, '谷雨'],
    [5, 5, '立夏'], [5, 21, '小满'],
    [6, 5, '芒种'], [6, 21, '夏至'],
    [7, 7, '小暑'], [7, 22, '大暑'],
    [8, 7, '立秋'], [8, 23, '处暑'],
    [9, 7, '白露'], [9, 23, '秋分'],
    [10, 8, '寒露'], [10, 23, '霜降'],
    [11, 7, '立冬'], [11, 22, '小雪'],
    [12, 7, '大雪'], [12, 21, '冬至']
  ]

  let restQuoteIdx = 0
  let restClockTimer = 0
  let restQuoteTimer = 0

  const getSolarTerm = date => {
    const m = date.getMonth() + 1
    const d = date.getDate()
    let term = '冬至'
    for (let i = 0; i < SOLAR_TERMS.length; i += 1) {
      const [tm, td, name] = SOLAR_TERMS[i]
      if (m > tm || (m === tm && d >= td)) term = name
    }
    return term
  }

  const detectSeason = date => {
    const m = date.getMonth() + 1
    if (m >= 3 && m <= 5) return 'spring'
    if (m >= 6 && m <= 8) return 'summer'
    if (m >= 9 && m <= 11) return 'autumn'
    return 'winter'
  }

  const detectTimeMood = hourFloat => {
    if (hourFloat >= 16.75 && hourFloat <= 19.5) return 'dusk'
    if (hourFloat >= 5.5 && hourFloat < 8.5) return 'dawn'
    if (hourFloat >= 8.5 && hourFloat < 16.75) return 'day'
    return 'night'
  }

  const mapWeatherCode = code => {
    const c = Number(code)
    if (isNaN(c)) return { kind: 'clear', text: '晴', cloud: 0.22 }
    if (c === 0) return { kind: 'clear', text: '晴朗', cloud: 0.16 }
    if (c === 1) return { kind: 'clear', text: '晴间多云', cloud: 0.32 }
    if (c === 2 || c === 3) return { kind: 'cloudy', text: '云卷云舒', cloud: 0.62 }
    if (c === 45 || c === 48) return { kind: 'fog', text: '薄雾', cloud: 0.72 }
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || (c >= 95 && c <= 99)) {
      return { kind: 'rain', text: c >= 61 ? '落雨' : '细雨', cloud: 0.85 }
    }
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
      return { kind: 'snow', text: '飞雪', cloud: 0.78 }
    }
    return { kind: 'clear', text: '微风', cloud: 0.25 }
  }

  const state = {
    override: 'auto',
    manualHour: null, // null = follow real clock
    manualTemp: null, // null = follow real weather
    hourFloat: 14,
    timeMood: 'day',
    season: 'autumn',
    solarTerm: '小雪',
    city: DEFAULT_HOST.city,
    tempC: 15,
    liveTempC: null,
    tempMood: 'mild',
    weatherKind: 'clear',
    weatherText: '晴风',
    cloudCover: 0.25,
    windKmh: 9,
    activeScene: 'autumn',
    restMode: false,
    sound: ''
  }

  try {
    const savedOverride = sessionStorage.getItem(OVERRIDE_KEY)
    if (savedOverride && (savedOverride === 'auto' || SCENE_META[savedOverride])) {
      state.override = savedOverride
    }
  } catch (e) {}

  const resolveActiveScene = () => {
    if (state.override && state.override !== 'auto' && SCENE_META[state.override]) {
      return state.override
    }
    if (root.getAttribute('data-theme') === 'dark' || state.timeMood === 'night') return 'night'
    if (state.weatherKind === 'rain') return 'rain'
    if (state.weatherKind === 'snow' || state.tempC <= 3) return 'winter'
    return state.season
  }

  const applyAtmosphere = () => {
    const now = new Date()
    const realHour = now.getHours() + now.getMinutes() / 60
    state.hourFloat = typeof state.manualHour === 'number' ? state.manualHour : realHour
    state.timeMood = detectTimeMood(state.hourFloat)
    const calSeason = detectSeason(now)
    state.solarTerm = getSolarTerm(now)

    const defaultSeasonTemp = calSeason === 'winter' ? 4 : (calSeason === 'summer' ? 28 : (calSeason === 'autumn' ? 15 : 19))
    const baseTemp = typeof state.liveTempC === 'number' ? state.liveTempC : defaultSeasonTemp
    state.tempC = typeof state.manualTemp === 'number' ? state.manualTemp : baseTemp
    state.tempMood = state.tempC <= 8 ? 'cold' : (state.tempC >= 25 ? 'warm' : 'mild')

    if (state.override !== 'auto' && SCENE_META[state.override]) {
      const m = SCENE_META[state.override]
      state.season = m.season
      if (state.override === 'night' && typeof state.manualHour !== 'number') {
        state.hourFloat = 22.5
        state.timeMood = 'night'
      } else if (state.override !== 'night' && state.timeMood === 'night' && typeof state.manualHour !== 'number') {
        state.hourFloat = state.override === 'autumn' ? 17.2 : 10.5
        state.timeMood = detectTimeMood(state.hourFloat)
      }
    } else {
      state.season = calSeason
    }

    const nextScene = resolveActiveScene()
    state.activeScene = nextScene
    const meta = SCENE_META[nextScene] || SCENE_META.spring

    const effectiveWeather = state.override === 'rain'
      ? 'rain'
      : (state.override === 'winter' && state.tempC <= 2 ? 'snow' : (state.override === 'auto' ? state.weatherKind : meta.weather))

    root.setAttribute('data-time-mood', state.timeMood)
    root.setAttribute('data-season', state.season)
    root.setAttribute('data-sanctuary-scene', nextScene)
    root.setAttribute('data-temp-mood', state.tempMood)
    root.setAttribute('data-weather', effectiveWeather)

    window.__blogAtmosphere = Object.assign({}, state, {
      effectiveWeather,
      sceneMeta: meta
    })

    updateSanctuaryUI()

    try {
      window.dispatchEvent(new CustomEvent('blog:atmosphere-change', {
        detail: window.__blogAtmosphere
      }))
    } catch (e) {}
  }

  const loadWeather = () => {
    try {
      const cachedRaw = localStorage.getItem(WEATHER_CACHE_KEY)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw)
        if (cached && Date.now() - cached.ts < 25 * 60 * 1000) {
          state.city = cached.city || DEFAULT_HOST.city
          state.liveTempC = cached.tempC
          state.weatherKind = cached.weatherKind || 'clear'
          state.weatherText = cached.weatherText || '晴'
          state.cloudCover = typeof cached.cloudCover === 'number' ? cached.cloudCover : 0.25
          state.windKmh = cached.windKmh || 9
          applyAtmosphere()
          return
        }
      }
    } catch (e) {}

    if (typeof window.fetch !== 'function') return

    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=' + DEFAULT_HOST.lat +
      '&longitude=' + DEFAULT_HOST.lng +
      '&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto'

    window.fetch(url, { credentials: 'omit', mode: 'cors' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data || !data.current) return
        const c = data.current
        const mapped = mapWeatherCode(c.weather_code)
        state.liveTempC = typeof c.temperature_2m === 'number' ? Math.round(c.temperature_2m) : null
        state.weatherKind = mapped.kind
        state.weatherText = mapped.text
        state.cloudCover = mapped.cloud
        state.windKmh = typeof c.wind_speed_10m === 'number' ? Math.round(c.wind_speed_10m) : 9
        try {
          localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
            ts: Date.now(),
            city: state.city,
            tempC: state.liveTempC,
            weatherKind: state.weatherKind,
            weatherText: state.weatherText,
            cloudCover: state.cloudCover,
            windKmh: state.windKmh
          }))
        } catch (e) {}
        applyAtmosphere()
      })
      .catch(() => {})
  }

  /* ==========================================================================
     Web Audio API 0KB 自然环境白噪音合成器（细雨 / 微风 / 暖炉）
     ========================================================================== */
  let audioCtx = null
  let activeSoundNode = null
  let activeGain = null
  let activeTimer = 0

  const stopAmbientSound = () => {
    window.clearInterval(activeTimer)
    activeTimer = 0
    if (activeGain && audioCtx) {
      try {
        activeGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.25)
      } catch (e) {}
    }
    const nodeToStop = activeSoundNode
    activeSoundNode = null
    activeGain = null
    window.setTimeout(() => {
      if (nodeToStop) {
        try { nodeToStop.stop() } catch (e) {}
        try { nodeToStop.disconnect() } catch (e) {}
      }
    }, 350)
  }

  const startAmbientSound = kind => {
    stopAmbientSound()
    if (!kind) {
      state.sound = ''
      updateSanctuaryUI()
      return
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    if (!audioCtx) audioCtx = new AudioContextClass()
    if (audioCtx.state === 'suspended') audioCtx.resume()

    const sampleRate = audioCtx.sampleRate
    const seconds = 4
    const buffer = audioCtx.createBuffer(1, sampleRate * seconds, sampleRate)
    const channel = buffer.getChannelData(0)

    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < channel.length; i += 1) {
      const white = Math.random() * 2 - 1
      b0 = 0.997 * b0 + white * 0.029
      b1 = 0.985 * b1 + white * 0.032
      b2 = 0.95 * b2 + white * 0.048
      let sample = (b0 + b1 + b2) * 0.35
      if (kind === 'fire' && Math.random() < 0.0018) {
        sample += (Math.random() * 2 - 1) * 0.65
      }
      channel[i] = Math.max(-0.95, Math.min(0.95, sample))
    }

    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const filter = audioCtx.createBiquadFilter()
    if (kind === 'rain') {
      filter.type = 'bandpass'
      filter.frequency.value = 920
      filter.Q.value = 0.7
    } else if (kind === 'breeze') {
      filter.type = 'lowpass'
      filter.frequency.value = 340
      filter.Q.value = 1.8
    } else {
      filter.type = 'lowpass'
      filter.frequency.value = 240
      filter.Q.value = 0.9
    }

    const gain = audioCtx.createGain()
    gain.gain.value = 0.001
    const targetVol = kind === 'rain' ? 0.16 : (kind === 'breeze' ? 0.14 : 0.18)
    gain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.6)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(audioCtx.destination)
    source.start(0)

    activeSoundNode = source
    activeGain = gain
    state.sound = kind

    let phase = 0
    activeTimer = window.setInterval(() => {
      if (!audioCtx || state.sound !== kind) return
      phase += 0.25
      if (kind === 'breeze') {
        const freq = 250 + Math.sin(phase * 0.6) * 110 + Math.cos(phase * 0.25) * 60
        filter.frequency.setTargetAtTime(Math.max(140, freq), audioCtx.currentTime, 0.3)
      } else if (kind === 'rain') {
        const freq = 860 + Math.sin(phase * 0.35) * 90
        filter.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.4)
      }
    }, 350)

    updateSanctuaryUI()
  }

  const toggleSound = kind => {
    if (state.sound === kind) startAmbientSound('')
    else startAmbientSound(kind)
  }

  /* ==========================================================================
     天时漫游胶囊（含 24h 时间滑块 & 气温滑块） & 放空小憩模式 UI
     ========================================================================== */
  const formatHour = h => {
    const totalMin = Math.round(((h % 24) + 24) % 24 * 60)
    const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0')
    const mm = String(totalMin % 60).padStart(2, '0')
    return hh + ':' + mm
  }

  const formatSummaryText = () => {
    const meta = SCENE_META[state.activeScene] || SCENE_META.spring
    const tempStr = ' ' + state.tempC + '°C'
    if (state.override !== 'auto' || typeof state.manualHour === 'number') {
      return meta.icon + ' ' + meta.label + ' · ' + formatHour(state.hourFloat) + tempStr
    }
    return meta.icon + ' ' + state.city + ' · ' + state.solarTerm + tempStr + ' · ' + state.weatherText
  }

  const setSceneOverride = next => {
    state.override = next
    if (next === 'auto') {
      state.manualHour = null
      state.manualTemp = null
    }
    try {
      sessionStorage.setItem(OVERRIDE_KEY, next)
    } catch (e) {}

    if (next === 'night' && root.getAttribute('data-theme') !== 'dark') {
      if (window.btf) btf.activateDarkMode()
      else root.setAttribute('data-theme', 'dark')
    } else if (next !== 'night' && next !== 'auto' && root.getAttribute('data-theme') === 'dark') {
      if (window.btf) btf.activateLightMode()
      else root.setAttribute('data-theme', 'light')
    }
    applyAtmosphere()
  }

  const toggleRestMode = force => {
    const next = typeof force === 'boolean' ? force : !state.restMode
    state.restMode = next
    root.classList.toggle('is-sanctuary-rest', next)
    if (next) {
      root.classList.remove('is-reading-depth')
      ensureRestOverlay()
      updateRestClock()
    }
    applyAtmosphere()
  }

  const updateRestClock = () => {
    const clockEl = document.getElementById('sanctuary-rest-clock')
    const metaEl = document.getElementById('sanctuary-rest-meta')
    if (!clockEl || !metaEl) return
    clockEl.textContent = formatHour(state.hourFloat)
    metaEl.textContent = [
      state.city,
      state.solarTerm,
      (SCENE_META[state.activeScene] || SCENE_META.spring).label,
      state.tempC + '°C',
      state.windKmh ? '微风 ' + state.windKmh + ' km/h' : ''
    ].filter(Boolean).join(' · ')
  }

  const ensureRestOverlay = () => {
    let overlay = document.getElementById('sanctuary-rest-overlay')
    if (overlay) return overlay
    overlay = document.createElement('aside')
    overlay.id = 'sanctuary-rest-overlay'
    overlay.className = 'sanctuary-rest'
    overlay.setAttribute('aria-label', '放空小憩画面')
    overlay.innerHTML =
      '<div class="sanctuary-rest__center">' +
        '<div class="sanctuary-rest__clock" id="sanctuary-rest-clock">17:30</div>' +
        '<div class="sanctuary-rest__meta" id="sanctuary-rest-meta"></div>' +
        '<p class="sanctuary-rest__quote" id="sanctuary-rest-quote">' + REST_QUOTES[0] + '</p>' +
      '</div>' +
      '<div class="sanctuary-rest__bar">' +
        '<div class="sanctuary-rest__scenes" role="group" aria-label="切换 3D 天时世界">' +
          '<button type="button" data-scene-pick="auto">🌤️ 真实天时</button>' +
          '<button type="button" data-scene-pick="spring">🌸 春樱</button>' +
          '<button type="button" data-scene-pick="summer">🌊 夏海</button>' +
          '<button type="button" data-scene-pick="autumn">🍂 金秋</button>' +
          '<button type="button" data-scene-pick="winter">❄️ 冬雪</button>' +
          '<button type="button" data-scene-pick="rain">🌧️ 听雨</button>' +
          '<button type="button" data-scene-pick="night">🌌 星夜</button>' +
        '</div>' +
        '<div class="sanctuary-rest__sounds" role="group" aria-label="自然环境音">' +
          '<button type="button" data-sound-pick="rain">🌧️ 雨声</button>' +
          '<button type="button" data-sound-pick="breeze">🍃 微风</button>' +
          '<button type="button" data-sound-pick="fire">🔥 暖炉</button>' +
        '</div>' +
        '<button type="button" class="sanctuary-rest__exit" data-rest-exit>回到阅读 ×</button>' +
      '</div>'

    document.body.appendChild(overlay)

    window.clearInterval(restClockTimer)
    restClockTimer = window.setInterval(updateRestClock, 15000)

    window.clearInterval(restQuoteTimer)
    restQuoteTimer = window.setInterval(() => {
      if (!state.restMode) return
      const qEl = document.getElementById('sanctuary-rest-quote')
      if (!qEl) return
      qEl.classList.add('is-fading')
      window.setTimeout(() => {
        restQuoteIdx = (restQuoteIdx + 1) % REST_QUOTES.length
        qEl.textContent = REST_QUOTES[restQuoteIdx]
        qEl.classList.remove('is-fading')
      }, 420)
    }, 15000)

    return overlay
  }

  const ensureNavWidget = () => {
    if (typeof document === 'undefined' || !document.body) return null
    let dock = document.getElementById('sanctuary-dock')
    if (!dock) {
      dock = document.createElement('div')
      dock.id = 'sanctuary-dock'
      dock.className = 'sanctuary-dock'
      dock.innerHTML =
        '<div class="sanctuary-dock__pills">' +
          '<button type="button" class="sanctuary-dock__weather" id="sanctuary-weather-btn" aria-expanded="false" title="自由调节 3D 天时、季节、天气、气温与白噪音">' +
            '<span id="sanctuary-weather-text">🍂 杭州 · 小雪</span>' +
          '</button>' +
          '<button type="button" class="sanctuary-dock__rest" id="sanctuary-rest-btn" title="隐去文字卡片，放空看 3D 风景听风 (Alt+R)">' +
            '🎐 小憩' +
          '</button>' +
        '</div>' +
        '<div class="sanctuary-popover" id="sanctuary-popover" hidden>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">3D 季节与天气意境</div>' +
            '<div class="sanctuary-popover__grid">' +
              '<button type="button" data-scene-pick="auto">🌤️ 真实天时</button>' +
              '<button type="button" data-scene-pick="spring">🌸 春樱晴野</button>' +
              '<button type="button" data-scene-pick="summer">🌊 夏海碧空</button>' +
              '<button type="button" data-scene-pick="autumn">🍂 金秋原野</button>' +
              '<button type="button" data-scene-pick="winter">❄️ 冬日晴雪</button>' +
              '<button type="button" data-scene-pick="rain">🌧️ 烟雨湖山</button>' +
              '<button type="button" data-scene-pick="night">🌌 星河静夜</button>' +
            '</div>' +
          '</div>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">' +
              '<span>🌅 太阳/天色时间漫游</span>' +
              '<strong id="sanctuary-hour-val">跟随此刻</strong>' +
            '</div>' +
            '<input type="range" class="sanctuary-slider" id="sanctuary-hour-slider" min="0" max="24" step="0.25" value="14" aria-label="调节一天中的时间">' +
          '</div>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">' +
              '<span>🌡️ 气温冷暖氛围</span>' +
              '<strong id="sanctuary-temp-val">15°C</strong>' +
            '</div>' +
            '<input type="range" class="sanctuary-slider" id="sanctuary-temp-slider" min="-5" max="35" step="1" value="15" aria-label="调节气温氛围">' +
          '</div>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">自然白噪音（实时合成 · 0流量）</div>' +
            '<div class="sanctuary-popover__sounds">' +
              '<button type="button" data-sound-pick="rain">🌧️ 窗前细雨</button>' +
              '<button type="button" data-sound-pick="breeze">🍃 林间微风</button>' +
              '<button type="button" data-sound-pick="fire">🔥 暖炉篝火</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      document.body.appendChild(dock)

      const hourSlider = dock.querySelector('#sanctuary-hour-slider')
      if (hourSlider) {
        hourSlider.addEventListener('input', e => {
          const val = parseFloat(e.target.value)
          if (!isNaN(val)) {
            state.manualHour = val
            const nightNow = val < 5.5 || val > 19.6
            if (nightNow && root.getAttribute('data-theme') !== 'dark') {
              root.setAttribute('data-theme', 'dark')
            } else if (!nightNow && root.getAttribute('data-theme') === 'dark') {
              root.setAttribute('data-theme', 'light')
            }
            applyAtmosphere()
          }
        })
      }

      const tempSlider = dock.querySelector('#sanctuary-temp-slider')
      if (tempSlider) {
        tempSlider.addEventListener('input', e => {
          const val = parseInt(e.target.value, 10)
          if (!isNaN(val)) {
            state.manualTemp = val
            applyAtmosphere()
          }
        })
      }
    }
    return dock
  }

  function updateSanctuaryUI () {
    if (typeof document === 'undefined' || !document.body) return
    ensureNavWidget()
    const textEl = document.getElementById('sanctuary-weather-text')
    if (textEl) textEl.textContent = formatSummaryText()

    const hourVal = document.getElementById('sanctuary-hour-val')
    const hourSlider = document.getElementById('sanctuary-hour-slider')
    if (hourVal) {
      hourVal.textContent = typeof state.manualHour === 'number'
        ? formatHour(state.manualHour)
        : '实时 ' + formatHour(state.hourFloat)
    }
    if (hourSlider && document.activeElement !== hourSlider) {
      hourSlider.value = String(Math.round(state.hourFloat * 4) / 4)
    }

    const tempVal = document.getElementById('sanctuary-temp-val')
    const tempSlider = document.getElementById('sanctuary-temp-slider')
    if (tempVal) {
      tempVal.textContent = state.tempC + '°C · ' + (state.tempMood === 'cold' ? '寒凉' : (state.tempMood === 'warm' ? '晴暖' : '温润'))
    }
    if (tempSlider && document.activeElement !== tempSlider) {
      tempSlider.value = String(state.tempC)
    }

    const restBtn = document.getElementById('sanctuary-rest-btn')
    if (restBtn) {
      restBtn.textContent = state.restMode ? '📖 回到阅读' : '🎐 小憩'
      restBtn.classList.toggle('is-active', state.restMode)
    }

    document.querySelectorAll('[data-scene-pick]').forEach(btn => {
      const val = btn.getAttribute('data-scene-pick')
      const active = state.override === 'auto'
        ? val === 'auto'
        : val === state.override
      btn.classList.toggle('is-active', active)
    })

    document.querySelectorAll('[data-sound-pick]').forEach(btn => {
      const val = btn.getAttribute('data-sound-pick')
      btn.classList.toggle('is-active', Boolean(state.sound && state.sound === val))
    })

    if (state.restMode) updateRestClock()
  }

  const syncScrollDepth = () => {
    if (state.restMode) {
      root.classList.remove('is-reading-depth')
      return
    }
    const header = document.getElementById('page-header')
    const isFull = Boolean(header && header.classList.contains('full_page'))
    const threshold = isFull ? 240 : 40
    root.classList.toggle('is-reading-depth', (window.scrollY || 0) > threshold)
  }

  applyAtmosphere()
  window.setInterval(applyAtmosphere, 60000)
  window.addEventListener('scroll', syncScrollDepth, { passive: true })

  document.addEventListener('DOMContentLoaded', () => {
    applyAtmosphere()
    syncScrollDepth()
    loadWeather()
  })

  document.addEventListener('pjax:complete', () => {
    applyAtmosphere()
    syncScrollDepth()
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.restMode) {
      toggleRestMode(false)
    } else if (event.altKey && (event.key === 'r' || event.key === 'R')) {
      event.preventDefault()
      toggleRestMode()
    }
  })

  const runThemeHooks = mode => {
    const themeChange = (window.globalFn && window.globalFn.themeChange) || {}
    Object.keys(themeChange).forEach(key => {
      const fn = themeChange[key]
      if (typeof fn === 'function') fn(mode)
    })
  }

  const saveTheme = mode => {
    if (window.btf && btf.saveToLocal) {
      btf.saveToLocal.set('theme', mode, 2)
    } else {
      localStorage.setItem('theme', JSON.stringify({
        value: mode,
        expiry: Date.now() + 2 * 86400000
      }))
    }
  }

  const switchTheme = () => {
    const nextMode = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'

    if (window.btf) {
      nextMode === 'dark' ? btf.activateDarkMode() : btf.activateLightMode()
    } else {
      root.setAttribute('data-theme', nextMode)
    }

    if (nextMode === 'dark') {
      state.manualHour = 22.5
    } else {
      state.manualHour = null
      if (state.override === 'night') state.override = 'auto'
    }
    saveTheme(nextMode)
    runThemeHooks(nextMode)
    applyAtmosphere()
  }

  document.addEventListener('click', event => {
    const target = event.target
    if (!target || !target.closest) return

    const weatherBtn = target.closest('#sanctuary-weather-btn')
    const popover = document.getElementById('sanctuary-popover')
    if (weatherBtn && popover) {
      event.stopPropagation()
      const nextOpen = popover.hidden
      popover.hidden = !nextOpen
      weatherBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
      return
    }

    const restBtn = target.closest('#sanctuary-rest-btn')
    if (restBtn) {
      event.stopPropagation()
      if (popover) popover.hidden = true
      toggleRestMode()
      return
    }

    const exitBtn = target.closest('[data-rest-exit]')
    if (exitBtn) {
      event.stopPropagation()
      toggleRestMode(false)
      return
    }

    const sceneBtn = target.closest('[data-scene-pick]')
    if (sceneBtn) {
      event.stopPropagation()
      setSceneOverride(sceneBtn.getAttribute('data-scene-pick') || 'auto')
      return
    }

    const soundBtn = target.closest('[data-sound-pick]')
    if (soundBtn) {
      event.stopPropagation()
      toggleSound(soundBtn.getAttribute('data-sound-pick') || '')
      return
    }

    if (popover && !popover.hidden && !target.closest('#sanctuary-dock')) {
      popover.hidden = true
      const wb = document.getElementById('sanctuary-weather-btn')
      if (wb) wb.setAttribute('aria-expanded', 'false')
    }

    const button = target.closest('#darkmode')
    if (!button) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    if (reduceMotion.matches) {
      switchTheme()
      return
    }

    root.classList.add('theme-switching')

    if (document.startViewTransition) {
      try {
        const transition = document.startViewTransition(switchTheme)
        transition.finished.finally(() => {
          root.classList.remove('theme-switching')
        })
        return
      } catch (e) {
        /* fallback below */
      }
    }

    switchTheme()
    window.setTimeout(() => {
      root.classList.remove('theme-switching')
    }, 800)
  }, true)
})()
