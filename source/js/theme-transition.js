/**
 * 3D 山水天时与环境光照中枢 (Real-Time Time × Season × Weather × Temperature + Page Ambient Lighting + Acoustic Synthesizer)
 * - 实时同步：本地真实时间（太阳/月亮高度角）、二十四节气、四季、Open-Meteo 实时天气/气温/风速。
 * - 环境光协调引擎 (syncPageLightingToWorld)：将 3D 天空的实时天顶色、地平线散射光、色温反向投射至页面所有毛玻璃卡片与顶部导航，
 *   消除“卡片与 3D 世界割裂”的不协调感。
 * - 极简建筑感天时罗盘 (Architectural Horizon HUD)：告别廉价 Emoji 与霓虹渐变，支持在 3D 天空中直接拖拽日月或通过天际弧线拨动时间。
 */
(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const WEATHER_CACHE_KEY = 'blog_weather_cache_v2'
  const OVERRIDE_KEY = 'blog_scene_override_v2'

  const DEFAULT_HOST = {
    city: '杭州',
    lat: 30.2741,
    lng: 120.1551
  }

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

  const SCENE_META = {
    spring: { label: '春分', desc: '山樱初绽', season: 'spring', weather: 'clear', defaultHour: 10.2, defaultTemp: 19 },
    summer: { label: '夏至', desc: '碧湖晴岚', season: 'summer', weather: 'clear', defaultHour: 14.2, defaultTemp: 27 },
    autumn: { label: '秋分', desc: '层林尽染', season: 'autumn', weather: 'clear', defaultHour: 17.2, defaultTemp: 15 },
    winter: { label: '冬至', desc: '远峰霁雪', season: 'winter', weather: 'snow',  defaultHour: 11.2, defaultTemp: -2 },
    rain:   { label: '听雨', desc: '烟雨空濛', season: 'summer', weather: 'rain',  defaultHour: 14.8, defaultTemp: 16 },
    night:  { label: '星夜', desc: '银河静谷', season: 'autumn', weather: 'clear', defaultHour: 22.5, defaultTemp: 10 }
  }

  const REST_QUOTES = [
    '山中无甲子，寒尽不知年。可直接按住天空中的日月拨动晨昏，或轻触湖面看涟漪扩散。',
    '风吹过山谷的时候，云影和湖水都在呼吸。滚动鼠标滚轮，可向湖心缓缓推进。',
    '在空白处按住鼠标左右拖拽，可以环视整座 3D 山谷与远方雪峰。',
    '不必追赶时间，听一会儿松风或细雨，让视线停在远山与流云之间。'
  ]

  const state = {
    override: 'auto',
    manualHour: null,
    manualTemp: null,
    hourFloat: 15.5,
    timeMood: 'day',
    season: 'autumn',
    solarTerm: '小雪',
    city: DEFAULT_HOST.city,
    tempC: 15,
    liveTempC: null,
    tempMood: 'mild',
    weatherKind: 'clear',
    weatherText: '晴',
    cloudCover: 0.28,
    windKmh: 9,
    activeScene: 'autumn',
    restMode: false,
    sound: ''
  }

  let restQuoteIndex = 0
  let restClockTimer = 0
  let restQuoteTimer = 0

  try {
    const savedOverride = sessionStorage.getItem(OVERRIDE_KEY)
    if (savedOverride && (savedOverride === 'auto' || SCENE_META[savedOverride])) {
      state.override = savedOverride
    }
  } catch (e) {}

  const getSolarTerm = date => {
    const m = date.getMonth() + 1
    const d = date.getDate()
    let latest = '冬至'
    for (let i = 0; i < SOLAR_TERMS.length; i += 1) {
      const [tm, td, name] = SOLAR_TERMS[i]
      if (m > tm || (m === tm && d >= td)) latest = name
    }
    return latest
  }

  const detectSeason = date => {
    const m = date.getMonth() + 1
    if (m >= 3 && m <= 5) return 'spring'
    if (m >= 6 && m <= 8) return 'summer'
    if (m >= 9 && m <= 11) return 'autumn'
    return 'winter'
  }

  const detectTimeMood = hourFloat => {
    if (hourFloat >= 5.5 && hourFloat < 8.2) return 'dawn'
    if (hourFloat >= 8.2 && hourFloat < 16.6) return 'day'
    if (hourFloat >= 16.6 && hourFloat < 19.3) return 'dusk'
    return 'night'
  }

  const mapWeatherCode = code => {
    const n = Number(code)
    if (isNaN(n)) return { kind: 'clear', text: '晴', cloud: 0.24 }
    if (n === 0) return { kind: 'clear', text: '晴朗', cloud: 0.16 }
    if (n === 1 || n === 2) return { kind: 'clear', text: '少云', cloud: 0.34 }
    if (n === 3) return { kind: 'cloudy', text: '云层', cloud: 0.68 }
    if (n >= 45 && n <= 48) return { kind: 'fog', text: '山雾', cloud: 0.78 }
    if ((n >= 51 && n <= 67) || (n >= 80 && n <= 82) || (n >= 95 && n <= 99)) {
      return { kind: 'rain', text: '细雨', cloud: 0.88 }
    }
    if ((n >= 71 && n <= 77) || (n >= 85 && n <= 86)) {
      return { kind: 'snow', text: '落雪', cloud: 0.82 }
    }
    return { kind: 'clear', text: '晴', cloud: 0.25 }
  }

  const resolveActiveScene = () => {
    if (state.override && state.override !== 'auto' && SCENE_META[state.override]) {
      return state.override
    }
    if (root.getAttribute('data-theme') === 'dark' || state.timeMood === 'night') return 'night'
    if (state.weatherKind === 'rain') return 'rain'
    if (state.weatherKind === 'snow' || state.tempC <= 2) return 'winter'
    return state.season
  }

  /* ==========================================================================
     环境光协调引擎：将 3D 世界的太阳高度角、季节色温、阴雨雾气投射到页面 UI
     ========================================================================== */
  const syncPageLightingToWorld = effectiveWeather => {
    const isDark = root.getAttribute('data-theme') === 'dark' || state.timeMood === 'night'
    const dayAngle = ((state.hourFloat - 5.75) / 12.5) * Math.PI
    const sunElev = Math.sin(dayAngle)
    const twilight = Math.max(0, Math.min(1, 1 - Math.abs(sunElev - 0.08) * 3.2))
    const isRain = effectiveWeather === 'rain'
    const tempShift = Math.max(-1, Math.min(1, (state.tempC - 15) / 18))

    if (isDark) {
      root.style.setProperty('--world-card-bg', 'rgba(13, 20, 34, 0.72)')
      root.style.setProperty('--world-card-border', 'rgba(148, 176, 218, 0.14)')
      root.style.setProperty('--world-card-shadow', '0 20px 50px rgba(2, 6, 15, 0.52)')
      root.style.setProperty('--world-nav-bg', 'linear-gradient(180deg, rgba(10, 16, 28, 0.76) 0%, rgba(10, 16, 28, 0.34) 100%)')
      root.style.setProperty('--world-accent', '#8ab4f8')
      return
    }

    // Compute subtle physical tint for daylight / twilight / rain / seasonal warmth
    let r = 250 + Math.round(twilight * 5 + tempShift * 3 - (isRain ? 10 : 0))
    let g = 251 - Math.round(twilight * 5 - (isRain ? 3 : 0))
    let b = 253 - Math.round(twilight * 14 + tempShift * 5)
    r = Math.max(232, Math.min(255, r))
    g = Math.max(236, Math.min(255, g))
    b = Math.max(230, Math.min(255, b))

    const borderR = Math.min(255, r + 4)
    const borderG = Math.min(255, g + 2)
    const borderB = Math.min(255, b)

    const shadowAlpha = isRain ? 0.11 : (0.13 + twilight * 0.04)
    const navTopAlpha = isRain ? 0.74 : 0.68
    const navBotAlpha = isRain ? 0.36 : 0.28

    let accent = '#3b6e8c'
    if (state.season === 'spring') accent = '#8c586c'
    else if (state.season === 'summer') accent = '#2d6e7e'
    else if (state.season === 'autumn') accent = '#8f5d38'
    else if (state.season === 'winter') accent = '#456789'
    if (isRain) accent = '#3f6a6e'

    root.style.setProperty('--world-card-bg', `rgba(${r}, ${g}, ${b}, 0.72)`)
    root.style.setProperty('--world-card-border', `rgba(${borderR}, ${borderG}, ${borderB}, 0.62)`)
    root.style.setProperty('--world-card-shadow', `0 18px 44px rgba(18, 28, 42, ${shadowAlpha.toFixed(2)})`)
    root.style.setProperty(
      '--world-nav-bg',
      `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, ${navTopAlpha}) 0%, rgba(${r}, ${g}, ${b}, ${navBotAlpha}) 100%)`
    )
    root.style.setProperty('--world-accent', accent)
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
        state.hourFloat = state.override === 'autumn' ? 16.8 : 10.2
        state.timeMood = detectTimeMood(state.hourFloat)
      }
    } else {
      state.season = calSeason
    }

    const nextScene = resolveActiveScene()
    state.activeScene = nextScene
    const meta = SCENE_META[nextScene] || SCENE_META.autumn

    const effectiveWeather = state.override === 'rain'
      ? 'rain'
      : (state.override === 'winter' && state.tempC <= 2 ? 'snow' : (state.override === 'auto' ? state.weatherKind : meta.weather))

    root.setAttribute('data-time-mood', state.timeMood)
    root.setAttribute('data-season', state.season)
    root.setAttribute('data-sanctuary-scene', nextScene)
    root.setAttribute('data-temp-mood', state.tempMood)
    root.setAttribute('data-weather', effectiveWeather)

    syncPageLightingToWorld(effectiveWeather)

    window.__blogAtmosphere = Object.assign({}, state, {
      effectiveWeather,
      sceneMeta: meta,
      setManualHour: h => {
        const clamped = Math.max(0, Math.min(23.98, Number(h) || 0))
        state.manualHour = clamped
        const nightNow = clamped < 5.5 || clamped > 19.4
        if (nightNow && root.getAttribute('data-theme') !== 'dark') {
          root.setAttribute('data-theme', 'dark')
        } else if (!nightNow && root.getAttribute('data-theme') === 'dark') {
          root.setAttribute('data-theme', 'light')
        }
        applyAtmosphere()
      }
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
     Web Audio API 0KB 自然环境白噪音合成器（细雨 / 松风 / 炉火）
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
    state.sound = ''
    window.setTimeout(() => {
      if (nodeToStop) {
        try { nodeToStop.stop() } catch (e) {}
        try { nodeToStop.disconnect() } catch (e) {}
      }
    }, 280)
    updateSanctuaryUI()
  }

  const startAmbientSound = kind => {
    if (!kind || state.sound === kind) {
      stopAmbientSound()
      return
    }
    stopAmbientSound()

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    if (!audioCtx) audioCtx = new AudioContextClass()
    if (audioCtx.state === 'suspended') audioCtx.resume()

    const sampleRate = audioCtx.sampleRate
    const bufferSize = sampleRate * 3
    const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate)
    const data = buffer.getChannelData(0)

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < bufferSize; i += 1) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035
      b6 = white * 0.115926
    }

    const src = audioCtx.createBufferSource()
    src.buffer = buffer
    src.loop = true

    const filter = audioCtx.createBiquadFilter()
    const masterGain = audioCtx.createGain()
    masterGain.gain.setValueAtTime(0.001, audioCtx.currentTime)

    if (kind === 'rain') {
      filter.type = 'bandpass'
      filter.frequency.value = 1080
      filter.Q.value = 0.65
      masterGain.gain.setTargetAtTime(0.18, audioCtx.currentTime, 0.5)
    } else if (kind === 'breeze') {
      filter.type = 'lowpass'
      filter.frequency.value = 390
      filter.Q.value = 1.6
      masterGain.gain.setTargetAtTime(0.14, audioCtx.currentTime, 0.6)
      let phase = 0
      activeTimer = window.setInterval(() => {
        if (!audioCtx || state.sound !== 'breeze') return
        phase += 0.35
        const freq = 270 + Math.sin(phase) * 140 + Math.cos(phase * 0.6) * 70
        filter.frequency.setTargetAtTime(Math.max(150, freq), audioCtx.currentTime, 0.4)
      }, 420)
    } else if (kind === 'fire') {
      filter.type = 'lowpass'
      filter.frequency.value = 250
      masterGain.gain.setTargetAtTime(0.2, audioCtx.currentTime, 0.5)
      activeTimer = window.setInterval(() => {
        if (!audioCtx || state.sound !== 'fire') return
        if (Math.random() < 0.6) {
          const popOsc = audioCtx.createOscillator()
          const popGain = audioCtx.createGain()
          popOsc.type = 'triangle'
          popOsc.frequency.setValueAtTime(1100 + Math.random() * 1600, audioCtx.currentTime)
          popGain.gain.setValueAtTime(0.016 * Math.random(), audioCtx.currentTime)
          popGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.035)
          popOsc.connect(popGain)
          popGain.connect(audioCtx.destination)
          popOsc.start()
          popOsc.stop(audioCtx.currentTime + 0.04)
        }
      }, 360)
    }

    src.connect(filter)
    filter.connect(masterGain)
    masterGain.connect(audioCtx.destination)
    src.start()

    activeSoundNode = src
    activeGain = masterGain
    state.sound = kind
    updateSanctuaryUI()
  }

  /* ==========================================================================
     极简建筑感天时罗盘 (Architectural Horizon HUD) & 静观模式 UI
     ========================================================================== */
  const formatHour = h => {
    const totalMin = Math.round(((h % 24) + 24) % 24 * 60)
    const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0')
    const mm = String(totalMin % 60).padStart(2, '0')
    return hh + ':' + mm
  }

  const formatSummaryText = () => {
    const meta = SCENE_META[state.activeScene] || SCENE_META.autumn
    const tempStr = state.tempC + '°C'
    if (state.override !== 'auto' || typeof state.manualHour === 'number') {
      return meta.label + ' · ' + formatHour(state.hourFloat) + ' · ' + tempStr
    }
    return state.city + ' · ' + state.solarTerm + ' · ' + state.weatherText + ' ' + tempStr
  }

  const setSceneOverride = next => {
    state.override = next
    if (next === 'auto') {
      state.manualHour = null
      state.manualTemp = null
    } else if (SCENE_META[next]) {
      state.manualHour = SCENE_META[next].defaultHour
      state.manualTemp = SCENE_META[next].defaultTemp
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
    const meta = SCENE_META[state.activeScene] || SCENE_META.autumn
    metaEl.textContent = [
      state.city,
      state.solarTerm,
      meta.label + ' · ' + meta.desc,
      state.tempC + '°C',
      state.windKmh ? '风速 ' + state.windKmh + ' km/h' : ''
    ].filter(Boolean).join('  /  ')
  }

  const ensureRestOverlay = () => {
    let overlay = document.getElementById('sanctuary-rest-overlay')
    if (overlay) return overlay
    overlay = document.createElement('aside')
    overlay.id = 'sanctuary-rest-overlay'
    overlay.className = 'sanctuary-rest'
    overlay.setAttribute('aria-label', '静观山水模式')
    overlay.innerHTML =
      '<div class="sanctuary-rest__center">' +
        '<div class="sanctuary-rest__clock" id="sanctuary-rest-clock">17:30</div>' +
        '<div class="sanctuary-rest__meta" id="sanctuary-rest-meta"></div>' +
        '<p class="sanctuary-rest__quote" id="sanctuary-rest-quote">' + REST_QUOTES[0] + '</p>' +
      '</div>' +
      '<div class="sanctuary-rest__bar">' +
        '<div class="sanctuary-rest__scenes" role="group" aria-label="切换天时">' +
          '<button type="button" data-scene-pick="auto">实况</button>' +
          '<button type="button" data-scene-pick="spring">春分</button>' +
          '<button type="button" data-scene-pick="summer">夏至</button>' +
          '<button type="button" data-scene-pick="autumn">秋分</button>' +
          '<button type="button" data-scene-pick="winter">冬至</button>' +
          '<button type="button" data-scene-pick="rain">听雨</button>' +
          '<button type="button" data-scene-pick="night">星夜</button>' +
        '</div>' +
        '<span class="sanctuary-rest__divider"></span>' +
        '<div class="sanctuary-rest__sounds" role="group" aria-label="环境白噪音">' +
          '<button type="button" data-sound-pick="rain">细雨</button>' +
          '<button type="button" data-sound-pick="breeze">松风</button>' +
          '<button type="button" data-sound-pick="fire">炉火</button>' +
        '</div>' +
        '<span class="sanctuary-rest__divider"></span>' +
        '<button type="button" class="sanctuary-rest__exit" data-rest-exit>返回阅读</button>' +
      '</div>'

    document.body.appendChild(overlay)

    window.clearInterval(restClockTimer)
    restClockTimer = window.setInterval(updateRestClock, 15000)

    window.clearInterval(restQuoteTimer)
    restQuoteTimer = window.setInterval(() => {
      if (!state.restMode) return
      const qEl = document.getElementById('sanctuary-rest-quote')
      if (!qEl) return
      restQuoteIndex = (restQuoteIndex + 1) % REST_QUOTES.length
      qEl.style.opacity = '0'
      window.setTimeout(() => {
        qEl.textContent = REST_QUOTES[restQuoteIndex]
        qEl.style.opacity = '1'
      }, 320)
    }, 14000)

    return overlay
  }

  const getWeatherIconSvg = (activeScene, effectiveWeather, isNight) => {
    if (effectiveWeather === 'rain' || activeScene === 'rain') {
      return (
        '<path d="M4.2 9.4h7.4a2.6 2.6 0 0 0 .3-5.18 3.7 3.7 0 0 0-7.18-.82A2.4 2.4 0 0 0 4.2 9.4Z"></path>' +
        '<path d="M5.6 11.6l-.8 2.2M8.4 11.6l-.8 2.2M11.2 11.6l-.8 2.2" stroke-linecap="round"></path>'
      )
    }
    if (effectiveWeather === 'snow' || activeScene === 'winter') {
      return (
        '<path d="M8 2v12M2.8 5l10.4 6M13.2 5L2.8 11" stroke-linecap="round"></path>' +
        '<circle cx="8" cy="8" r="1.4"></circle>'
      )
    }
    if (isNight || activeScene === 'night') {
      return '<path d="M12.6 9.8A5.2 5.2 0 0 1 6.2 3.4a5.4 5.4 0 1 0 6.4 6.4Z" stroke-linejoin="round"></path>'
    }
    return (
      '<circle cx="8" cy="8" r="3.1"></circle>' +
      '<path d="M8 1.6v1.9M8 12.5v1.9M1.6 8h1.9M12.5 8h1.9M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3" stroke-linecap="round"></path>'
    )
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
          '<button type="button" class="sanctuary-dock__weather" id="sanctuary-weather-btn" aria-expanded="false" title="调节 3D 山水天时、节气、日轨、气温与环境声">' +
            '<svg class="sanctuary-dock__icon" id="sanctuary-weather-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4">' +
              '<circle cx="8" cy="8" r="3.1"></circle>' +
              '<path d="M8 1.6v1.9M8 12.5v1.9M1.6 8h1.9M12.5 8h1.9M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3" stroke-linecap="round"></path>' +
            '</svg>' +
            '<span id="sanctuary-weather-text">杭州 · 小雪 · 15°C</span>' +
            '<span class="sanctuary-dock__sound-dot" id="sanctuary-sound-dot"></span>' +
          '</button>' +
          '<span class="sanctuary-dock__vsep"></span>' +
          '<button type="button" class="sanctuary-dock__rest" id="sanctuary-rest-btn" title="隐去页面卡片，沉浸环视 3D 山水 (Alt+R)">' +
            '静观' +
          '</button>' +
        '</div>' +
        '<div class="sanctuary-popover" id="sanctuary-popover" hidden>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">' +
              '<span>天时与四时节候</span>' +
              '<span class="sanctuary-popover__sub" id="sanctuary-scene-desc">实时天象</span>' +
            '</div>' +
            '<div class="sanctuary-popover__grid">' +
              '<button type="button" data-scene-pick="auto">实况同步</button>' +
              '<button type="button" data-scene-pick="spring">春分 · 山樱</button>' +
              '<button type="button" data-scene-pick="summer">夏至 · 碧岚</button>' +
              '<button type="button" data-scene-pick="autumn">秋分 · 枫林</button>' +
              '<button type="button" data-scene-pick="winter">冬至 · 霁雪</button>' +
              '<button type="button" data-scene-pick="rain">烟雨 · 听湖</button>' +
              '<button type="button" data-scene-pick="night">星夜 · 银河</button>' +
            '</div>' +
          '</div>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">' +
              '<span>日晷天体轨迹 (00:00 — 24:00)</span>' +
              '<strong id="sanctuary-hour-val">15:30</strong>' +
            '</div>' +
            '<input type="range" class="sanctuary-slider" id="sanctuary-hour-slider" min="0" max="23.9" step="0.1" value="15.5" aria-label="调节太阳与月亮时刻">' +
          '</div>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">' +
              '<span>海拔气温与雪线 (-5°C — 35°C)</span>' +
              '<strong id="sanctuary-temp-val">15°C</strong>' +
            '</div>' +
            '<input type="range" class="sanctuary-slider" id="sanctuary-temp-slider" min="-5" max="35" step="1" value="15" aria-label="调节气温与雪线">' +
          '</div>' +
          '<div class="sanctuary-popover__sec">' +
            '<div class="sanctuary-popover__title">' +
              '<span>合成自然声景</span>' +
              '<span class="sanctuary-popover__sub">Web Audio 实时生成</span>' +
            '</div>' +
            '<div class="sanctuary-popover__sounds">' +
              '<button type="button" data-sound-pick="rain">细雨</button>' +
              '<button type="button" data-sound-pick="breeze">松风</button>' +
              '<button type="button" data-sound-pick="fire">炉火</button>' +
            '</div>' +
          '</div>' +
          '<div class="sanctuary-popover__hint">' +
            '可按住天际日月拖动时间 · 划过湖面激起水波' +
          '</div>' +
        '</div>'
      document.body.appendChild(dock)

      const hourSlider = dock.querySelector('#sanctuary-hour-slider')
      if (hourSlider) {
        hourSlider.addEventListener('input', e => {
          const val = parseFloat(e.target.value)
          if (!isNaN(val) && window.__blogAtmosphere && window.__blogAtmosphere.setManualHour) {
            window.__blogAtmosphere.setManualHour(val)
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

    const iconEl = document.getElementById('sanctuary-weather-icon')
    if (iconEl) {
      const effWeather = root.getAttribute('data-weather') || state.weatherKind
      const isNight = root.getAttribute('data-theme') === 'dark' || state.timeMood === 'night'
      const nextSvg = getWeatherIconSvg(state.activeScene, effWeather, isNight)
      if (iconEl.getAttribute('data-icon-key') !== nextSvg) {
        iconEl.setAttribute('data-icon-key', nextSvg)
        iconEl.innerHTML = nextSvg
      }
    }

    const descEl = document.getElementById('sanctuary-scene-desc')
    if (descEl) {
      const meta = SCENE_META[state.activeScene] || SCENE_META.autumn
      descEl.textContent = state.override === 'auto' ? ('实况 · ' + meta.desc) : meta.desc
    }

    const soundDot = document.getElementById('sanctuary-sound-dot')
    if (soundDot) {
      soundDot.classList.toggle('is-playing', Boolean(state.sound))
    }

    const hourVal = document.getElementById('sanctuary-hour-val')
    const hourSlider = document.getElementById('sanctuary-hour-slider')
    if (hourVal) {
      hourVal.textContent = typeof state.manualHour === 'number'
        ? formatHour(state.manualHour)
        : '实况 ' + formatHour(state.hourFloat)
    }
    if (hourSlider && document.activeElement !== hourSlider) {
      hourSlider.value = String(Math.round(state.hourFloat * 10) / 10)
    }

    const tempVal = document.getElementById('sanctuary-temp-val')
    const tempSlider = document.getElementById('sanctuary-temp-slider')
    if (tempVal) {
      const snowNote = state.tempC <= 3 ? ' · 远峰积雪' : (state.tempC >= 26 ? ' · 晴暖' : ' · 温润')
      tempVal.textContent = state.tempC + '°C' + snowNote
    }
    if (tempSlider && document.activeElement !== tempSlider) {
      tempSlider.value = String(state.tempC)
    }

    const restBtn = document.getElementById('sanctuary-rest-btn')
    if (restBtn) {
      restBtn.textContent = state.restMode ? '返回' : '静观'
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
      startAmbientSound(soundBtn.getAttribute('data-sound-pick') || '')
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
