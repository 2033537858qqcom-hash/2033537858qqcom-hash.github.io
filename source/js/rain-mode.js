/**
 * 雨夜模式 · 沉浸式阅读（opt-in）
 * - html/body.rain-mode；localStorage: rain-mode = '1'；rain-prev-theme 记录开启前主题
 * - 画布雨滴：rAF，标签页隐藏即停，prefers-reduced-motion 下不动画（仅静态暗态）
 * - 雨声：Web Audio 合成（滤波噪声 + 稀疏水滴），无外部音频文件，需用户点击才发声
 * 早期应用（防闪烁）由 _config.butterfly.yml inject.head 的内联脚本负责。
 */
(function () {
  if (window.__rainModeLoaded) return
  window.__rainModeLoaded = true

  const KEY = 'rain-mode'
  const PREV = 'rain-prev-theme'
  const VOL = 'rain-volume'
  const root = document.documentElement
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener () {} }
  const get = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (e) {} }

  const isOn = () => root.classList.contains('rain-mode')

  /* ---------- 雨滴画布 ---------- */
  let canvas, ctx, drops = [], raf = 0, last = 0, W = 0, H = 0, dpr = 1
  const MAX_DROPS = () => Math.min(140, Math.round((W * H) / 14000))

  const newDrop = initial => ({
    x: Math.random() * W,
    y: initial ? Math.random() * H : -20,
    len: 10 + Math.random() * 16,
    v: 520 + Math.random() * 420,
    a: 0.08 + Math.random() * 0.18
  })

  const resize = () => {
    if (!canvas) return
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const n = MAX_DROPS()
    while (drops.length < n) drops.push(newDrop(true))
    drops.length = Math.min(drops.length, n)
    if (mq.matches) drawStatic()
  }

  const drawStatic = () => {
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(170,190,215,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    drops.forEach(d => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * 0.12, d.y + d.len) })
    ctx.stroke()
  }

  const frame = t => {
    raf = requestAnimationFrame(frame)
    // 约 30fps 上限，节省 CPU
    if (t - last < 33) return
    const dt = Math.min((t - last) / 1000, 0.1)
    last = t
    ctx.clearRect(0, 0, W, H)
    ctx.lineWidth = 1
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]
      d.y += d.v * dt
      d.x -= d.v * dt * 0.12
      if (d.y > H + 20 || d.x < -20) { drops[i] = newDrop(false); continue }
      ctx.strokeStyle = 'rgba(175,195,220,' + d.a + ')'
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x - d.len * 0.12, d.y + d.len)
      ctx.stroke()
    }
    window.__rainFrames = (window.__rainFrames || 0) + 1
  }

  const startRain = () => {
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.id = 'rain-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      ctx = canvas.getContext('2d')
      document.body.insertBefore(canvas, document.body.firstChild)
      resize()
    }
    canvas.hidden = false
    if (mq.matches) { drawStatic(); return }
    if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame) }
  }

  const stopRain = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    if (canvas) { canvas.hidden = true; ctx.clearRect(0, 0, W, H) }
  }

  /* ---------- 合成雨声（Web Audio） ---------- */
  let ac, master, srcNode, dropTimer, playing = false

  const buildAudio = () => {
    ac = new (window.AudioContext || window.webkitAudioContext)()
    master = ac.createGain()
    master.gain.value = 0
    master.connect(ac.destination)
    // 4 秒粉红噪声，循环；两层滤波：低频沙沙 + 中高频雨点
    const len = ac.sampleRate * 4
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const data = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.0990460
      b1 = 0.96300 * b1 + w * 0.2965164
      b2 = 0.57000 * b2 + w * 1.0526913
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18
    }
    // 首尾 0.1s 交叉淡化，使循环无爆音
    const fade = Math.floor(ac.sampleRate * 0.1)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      data[i] = data[i] * k + data[len - fade + i] * (1 - k)
    }
    srcNode = ac.createBufferSource()
    srcNode.buffer = buf
    srcNode.loop = true
    srcNode.loopEnd = (len - fade) / ac.sampleRate
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280
    srcNode.connect(hp); hp.connect(lp); lp.connect(master)
    srcNode.start()
  }

  const dripOnce = () => {
    if (!playing || !ac) return
    const o = ac.createOscillator()
    const g = ac.createGain()
    const t = ac.currentTime
    o.type = 'sine'
    o.frequency.setValueAtTime(900 + Math.random() * 1800, t)
    o.frequency.exponentialRampToValueAtTime(300 + Math.random() * 300, t + 0.06)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + 0.1)
    dropTimer = setTimeout(dripOnce, 120 + Math.random() * 700)
  }

  const volume = () => { const v = parseFloat(get(VOL)); return isNaN(v) ? 0.5 : Math.min(1, Math.max(0, v)) }
  const applyVolume = () => { if (master) master.gain.setTargetAtTime(playing ? volume() * volume() * 0.9 : 0, ac.currentTime, 0.15) }

  const playSound = () => {
    if (!ac) buildAudio()
    if (ac.state === 'suspended') ac.resume()
    playing = true
    applyVolume()
    clearTimeout(dropTimer)
    dropTimer = setTimeout(dripOnce, 400)
    syncUI()
  }

  const pauseSound = () => {
    playing = false
    clearTimeout(dropTimer)
    if (ac) { applyVolume(); setTimeout(() => { if (!playing && ac.state === 'running') ac.suspend() }, 600) }
    syncUI()
  }

  /* ---------- 主题保存 / 恢复 ---------- */
  const setTheme = mode => {
    if (window.btf && btf.activateDarkMode && btf.activateLightMode) {
      mode === 'dark' ? btf.activateDarkMode() : btf.activateLightMode()
    } else if (mode) {
      root.setAttribute('data-theme', mode)
    }
    const hooks = (window.globalFn && window.globalFn.themeChange) || {}
    Object.keys(hooks).forEach(k => { try { typeof hooks[k] === 'function' && hooks[k](mode) } catch (e) {} })
  }

  const enable = () => {
    if (!isOn()) {
      const cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
      if (!get(PREV)) set(PREV, cur)
    }
    root.classList.add('rain-mode')
    document.body && document.body.classList.add('rain-mode')
    if (root.getAttribute('data-theme') !== 'dark') setTheme('dark')
    set(KEY, '1')
    startRain()
    syncUI()
  }

  const disable = () => {
    root.classList.remove('rain-mode')
    document.body && document.body.classList.remove('rain-mode')
    set(KEY, null)
    stopRain()
    pauseSound()
    const prev = get(PREV)
    set(PREV, null)
    if (prev === 'light' || prev === 'dark') setTheme(prev)
    syncUI()
  }

  const toggle = () => (isOn() ? disable() : enable())

  /* ---------- UI ---------- */
  const syncUI = () => {
    const on = isOn()
    const btn = document.getElementById('rain-toggle')
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
      btn.title = on ? '退出雨夜模式（Esc）' : '雨夜模式 · 沉浸式阅读'
    }
    const panel = document.getElementById('rain-panel')
    if (panel) panel.hidden = !on
    const pb = document.getElementById('rain-sound')
    if (pb) {
      pb.setAttribute('aria-pressed', playing ? 'true' : 'false')
      pb.textContent = playing ? '暂停雨声' : '播放雨声'
    }
    const vol = document.getElementById('rain-volume')
    if (vol) vol.value = String(Math.round(volume() * 100))
  }

  const mountUI = () => {
    const host = document.getElementById('rightside-config-show') || document.getElementById('rightside')
    if (!host) return
    if (!document.getElementById('rain-toggle')) {
      const btn = document.createElement('button')
      btn.id = 'rain-toggle'
      btn.type = 'button'
      btn.setAttribute('aria-label', '雨夜模式 · 沉浸式阅读')
      btn.setAttribute('aria-pressed', 'false')
      btn.innerHTML = '<i class="fas fa-cloud-rain" aria-hidden="true"></i><span class="rain-toggle-text">雨夜</span>'
      host.insertBefore(btn, host.firstChild)
    }
    if (!document.getElementById('rain-panel')) {
      const panel = document.createElement('div')
      panel.id = 'rain-panel'
      panel.hidden = true
      panel.setAttribute('role', 'group')
      panel.setAttribute('aria-label', '雨声控制')
      panel.innerHTML =
        '<button id="rain-sound" type="button" aria-pressed="false">播放雨声</button>' +
        '<label>音量 <input id="rain-volume" type="range" min="0" max="100" step="5" aria-label="雨声音量"></label>'
      document.body.appendChild(panel)
    }
    syncUI()
  }

  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('#rain-toggle, #rain-sound')
    if (!t) return
    e.preventDefault()
    if (t.id === 'rain-toggle') toggle()
    else playing ? pauseSound() : playSound()
  })

  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'rain-volume') {
      set(VOL, String(e.target.value / 100))
      applyVolume()
    }
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOn() && !/INPUT|TEXTAREA/.test((e.target.tagName || ''))) disable()
  })

  document.addEventListener('visibilitychange', () => {
    if (!isOn()) return
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0 }
    else startRain()
  })

  window.addEventListener('resize', () => { if (isOn()) resize() })
  const onMq = () => { if (isOn()) { stopRain(); startRain() } }
  mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener && mq.addListener(onMq)

  const init = () => {
    mountUI()
    const want = get(KEY) === '1'
    if (want) {
      root.classList.add('rain-mode')
      document.body.classList.add('rain-mode')
      if (root.getAttribute('data-theme') !== 'dark') {
        if (!get(PREV)) set(PREV, 'light')
        setTheme('dark')
      }
      startRain()
    } else {
      document.body.classList.remove('rain-mode')
    }
    syncUI()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
  document.addEventListener('pjax:complete', init)
})()
