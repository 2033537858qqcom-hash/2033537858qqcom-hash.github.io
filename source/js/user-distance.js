/**
 * 访客与站长的山海距离（IP 粗定位，不申请浏览器 GPS）
 * 侧边栏文艺卡片：城市 + 公里 + 随机诗意文案
 */
(function () {
  // —— 站长坐标（默认上海；若你在其他城市请改这里）——
  const HOST = {
    lat: 31.2304,
    lng: 121.4737,
    city: '上海',
    label: '一座靠海的城'
  }

  const CACHE_KEY = 'user_distance_cache_v3'
  const CACHE_TTL = 24 * 60 * 60 * 1000

  /** 按距离分段的诗意文案池（会随机抽一条） */
  const POEMS = {
    near: [
      '同城的风也吹过你的窗台。相距仅 {d} 公里，像街角偶遇的一场晴。',
      '我们同在一座城里。{d} 公里外，你推开的或许是同一片天空。',
      '近得像一杯还温的茶。{d} 公里，刚好够一场说走就走的见面。',
      '原来你也在这里。{d} 公里的距离，短得像一句「你好」。'
    ],
    mid: [
      '风与云替我们走过 {d} 公里。你停在这里，便已是一种温柔的抵达。',
      '隔着 {d} 公里的山水，文字却先于脚步相遇。',
      '从你那边到我这边，大约 {d} 公里——刚好够装下一整段故事的开头。',
      '列车也许还要再开一会儿。{d} 公里外，感谢你翻开这一页。'
    ],
    far: [
      '山海相隔 {d} 公里。再远的坐标，也拦不住一次认真的阅读。',
      '你跨越了约 {d} 公里才来到这里。愿字里行间，能回赠一点温度。',
      '{d} 公里的风尘，换一页安静。很高兴你愿意停留。',
      '地图上拉长的线条，约 {d} 公里。在屏幕这一侧，我们仍是邻居。'
    ],
    remote: [
      '纵隔 {d} 公里，仰望的仍是同一片星空。',
      '{d} 公里外的你，与灯下的我，借代码与文字轻轻碰杯。',
      '地球弧线上的 {d} 公里，挡不住一句「到此一游」的温柔。',
      '很远，也很近。{d} 公里之外，欢迎来到我的小站。'
    ],
    unknown: [
      '风从远方来，也愿在此稍作停留。',
      '不知你来自哪一座城，只知文字会相遇。',
      '坐标未明，心意可感。谢谢你推开这扇门。',
      '山海之外，仍有人在读。愿你今日安好。'
    ]
  }

  function haversineKm (lat1, lon1, lat2, lon2) {
    const R = 6371
    const toRad = deg => (deg * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  }

  function escapeHtml (value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function pick (list) {
    return list[Math.floor(Math.random() * list.length)]
  }

  function bandOf (distance) {
    if (distance == null || Number.isNaN(distance)) return 'unknown'
    if (distance < 50) return 'near'
    if (distance < 600) return 'mid'
    if (distance < 2000) return 'far'
    return 'remote'
  }

  function buildPoem (distance, city) {
    const band = bandOf(distance)
    let line = pick(POEMS[band])
    if (distance != null && !Number.isNaN(distance)) {
      line = line.replace(/\{d\}/g, String(distance))
    }
    if (city && band !== 'unknown') {
      const openers = [
        `来自 <strong class="distance-highlight">${escapeHtml(city)}</strong> 的朋友，`,
        `你好，<strong class="distance-highlight">${escapeHtml(city)}</strong> 的旅人。`,
        `远道而来的 <strong class="distance-highlight">${escapeHtml(city)}</strong>，`
      ]
      return pick(openers) + line
    }
    return line
  }

  function fetchJson (url, ms) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = window.setTimeout(() => {
      if (controller) controller.abort()
    }, ms)

    return fetch(url, {
      signal: controller ? controller.signal : undefined,
      credentials: 'omit',
      cache: 'no-store'
    })
      .then(res => {
        window.clearTimeout(timer)
        if (!res.ok) throw new Error('status ' + res.status)
        return res.json()
      })
      .catch(err => {
        window.clearTimeout(timer)
        throw err
      })
  }

  /**
   * 多源定位：优先可跨域、较稳定的接口，失败则换下一个
   * 返回 { lat, lng, city, region, country } 或 null
   */
  function resolveVisitorGeo () {
    const parsers = [
      // GeoJS — 对浏览器 CORS 友好
      () =>
        fetchJson('https://get.geojs.io/v1/ip/geo.json', 4500).then(data => {
          if (!data || data.latitude == null || data.longitude == null) throw new Error('geojs')
          return {
            lat: Number(data.latitude),
            lng: Number(data.longitude),
            city: data.city || data.region || '',
            region: data.region || '',
            country: data.country || data.country_code || ''
          }
        }),
      // ipwho.is
      () =>
        fetchJson('https://ipwho.is/', 4500).then(data => {
          if (!data || data.success === false || data.latitude == null) throw new Error('ipwho')
          return {
            lat: Number(data.latitude),
            lng: Number(data.longitude),
            city: data.city || data.region || '',
            region: data.region || '',
            country: data.country || data.country_code || ''
          }
        }),
      // ipapi.co
      () =>
        fetchJson('https://ipapi.co/json/', 4500).then(data => {
          if (!data || data.error || data.latitude == null) throw new Error('ipapi')
          return {
            lat: Number(data.latitude),
            lng: Number(data.longitude),
            city: data.city || data.region || '',
            region: data.region || '',
            country: data.country_name || data.country || ''
          }
        }),
      // ip.sb
      () =>
        fetchJson('https://api.ip.sb/geoip', 4500).then(data => {
          if (!data || data.latitude == null || data.longitude == null) throw new Error('ipsb')
          return {
            lat: Number(data.latitude),
            lng: Number(data.longitude),
            city: data.city || data.region || data.region_code || '',
            region: data.region || '',
            country: data.country || data.country_code || ''
          }
        })
    ]

    let chain = Promise.reject(new Error('start'))
    parsers.forEach(run => {
      chain = chain.catch(() => run())
    })
    return chain.catch(() => null)
  }

  function readCache () {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!data || Date.now() - data.timestamp > CACHE_TTL) return null
      return data
    } catch (e) {
      return null
    }
  }

  function writeCache (payload) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify(Object.assign({ timestamp: Date.now() }, payload))
      )
    } catch (e) {}
  }

  function ensureWidget () {
    const asideContent = document.getElementById('aside-content')
    if (!asideContent) return null

    let widget = document.getElementById('card-user-distance')
    if (widget) return widget

    widget = document.createElement('div')
    widget.id = 'card-user-distance'
    widget.className = 'card-widget card-distance'
    widget.setAttribute('aria-live', 'polite')

    const cardAuthor = asideContent.querySelector('.card-info')
    if (cardAuthor && cardAuthor.nextSibling) {
      asideContent.insertBefore(widget, cardAuthor.nextSibling)
    } else if (cardAuthor) {
      cardAuthor.insertAdjacentElement('afterend', widget)
    } else {
      asideContent.insertBefore(widget, asideContent.firstChild)
    }
    return widget
  }

  function renderLoading () {
    const widget = ensureWidget()
    if (!widget) return
    widget.innerHTML = `
      <div class="item-headline">
        <i class="fas fa-feather-alt" aria-hidden="true"></i>
        <span>山海距离</span>
      </div>
      <div class="distance-content distance-content--loading">
        <p class="distance-text">正在测量风与云的距离…</p>
      </div>
    `
  }

  function renderDistanceWidget ({ distance, city, country }) {
    const widget = ensureWidget()
    if (!widget) return

    const hasDistance = typeof distance === 'number' && !Number.isNaN(distance)
    const poem = buildPoem(hasDistance ? distance : null, city)
    const placeBits = [city, country].filter(Boolean)
    const placeLine = placeBits.length
      ? placeBits.map(escapeHtml).join(' · ')
      : '远方'

    const metricHtml = hasDistance
      ? `
        <div class="distance-metric">
          <span class="distance-metric__value">${distance}</span>
          <span class="distance-metric__unit">公里</span>
        </div>
        <p class="distance-metric__caption">距 ${escapeHtml(HOST.city)}（${escapeHtml(HOST.label)}）</p>
      `
      : `
        <div class="distance-metric distance-metric--soft">
          <span class="distance-metric__value distance-metric__value--text">远方</span>
        </div>
        <p class="distance-metric__caption">坐标未明，心意可感</p>
      `

    widget.innerHTML = `
      <div class="item-headline">
        <i class="fas fa-feather-alt" aria-hidden="true"></i>
        <span>山海距离</span>
      </div>
      <div class="distance-content">
        ${metricHtml}
        <p class="distance-place"><i class="fas fa-map-marker-alt" aria-hidden="true"></i> ${placeLine}</p>
        <p class="distance-text">${poem}</p>
        <div class="distance-footer">
          <span class="distance-tag"><i class="fas fa-paper-plane" aria-hidden="true"></i> IP 粗略估算 · 仅作诗意点缀</span>
        </div>
      </div>
    `
  }

  function applyResult (geo) {
    if (!geo || geo.lat == null || geo.lng == null) {
      renderDistanceWidget({ distance: null, city: '', country: '' })
      writeCache({ distance: null, city: '', country: '', unknown: true })
      return
    }

    const distance = haversineKm(HOST.lat, HOST.lng, geo.lat, geo.lng)
    const city = geo.city || geo.region || ''
    const country = geo.country || ''
    writeCache({ distance, city, country, unknown: false })
    renderDistanceWidget({ distance, city, country })
  }

  function initUserDistance () {
    // 无侧栏页面直接跳过
    if (!document.getElementById('aside-content')) return

    const cached = readCache()
    if (cached) {
      renderDistanceWidget({
        distance: cached.unknown ? null : cached.distance,
        city: cached.city || '',
        country: cached.country || ''
      })
      return
    }

    renderLoading()
    resolveVisitorGeo().then(applyResult)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserDistance)
  } else {
    initUserDistance()
  }

  document.addEventListener('pjax:complete', initUserDistance)
})()
