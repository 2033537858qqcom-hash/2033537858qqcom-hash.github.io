/**
 * 访客与站长的山海距离
 * - 不申请浏览器 GPS，仅用 IP 粗定位
 * - 立刻渲染卡片（不依赖接口），定位成功后再更新数字
 * - 侧栏完整卡片 + 首页英雄区一行诗意提示
 * - 稳定单次抽取诗句，避免定时器重绘导致文本闪烁与 aria-live 重复播报
 */
(function () {
  // 站长锚点：杭州
  const HOST = {
    lat: 30.2741,
    lng: 120.1551,
    city: '杭州',
    label: '一座临水的城'
  }

  const CACHE_KEY = 'user_distance_cache_v5'
  const CACHE_TTL = 24 * 60 * 60 * 1000
  const FAIL_CACHE_TTL = 10 * 60 * 1000
  const ASIDE_ID = 'card-user-distance'
  const HERO_ID = 'hero-user-distance'

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
    const toRad = function (deg) { return (deg * Math.PI) / 180 }
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
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
    if (distance == null || isNaN(distance)) return 'unknown'
    if (distance < 50) return 'near'
    if (distance < 600) return 'mid'
    if (distance < 2000) return 'far'
    return 'remote'
  }

  function buildPoem (distance, city) {
    const band = bandOf(distance)
    var line = pick(POEMS[band])
    if (distance != null && !isNaN(distance)) {
      line = line.replace(/\{d\}/g, String(distance))
    }
    if (city && band !== 'unknown') {
      return '来自 <strong class="distance-highlight">' + escapeHtml(city) + '</strong> 的朋友，' + line
    }
    return line
  }

  function fetchJson (url, ms) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    var timer = window.setTimeout(function () {
      if (controller) controller.abort()
    }, ms)

    return fetch(url, {
      signal: controller ? controller.signal : undefined,
      credentials: 'omit',
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      window.clearTimeout(timer)
      if (!res.ok) throw new Error('status ' + res.status)
      return res.json()
    }).catch(function (err) {
      window.clearTimeout(timer)
      throw err
    })
  }

  function normalizeGeo (lat, lng, city, region, country) {
    lat = Number(lat)
    lng = Number(lng)
    if (isNaN(lat) || isNaN(lng)) throw new Error('bad coords')
    return {
      lat: lat,
      lng: lng,
      city: city || region || '',
      region: region || '',
      country: country || ''
    }
  }

  function resolveVisitorGeo () {
    var tasks = [
      function () {
        return fetchJson('https://get.geojs.io/v1/ip/geo.json', 3000).then(function (data) {
          return normalizeGeo(data.latitude, data.longitude, data.city, data.region, data.country || data.country_code)
        })
      },
      function () {
        return fetchJson('https://ipwho.is/', 3000).then(function (data) {
          if (data && data.success === false) throw new Error('ipwho fail')
          return normalizeGeo(data.latitude, data.longitude, data.city, data.region, data.country || data.country_code)
        })
      }
    ]

    var chain = Promise.reject(new Error('start'))
    tasks.forEach(function (run) {
      chain = chain.catch(function () { return run() })
    })
    return chain.catch(function () { return null })
  }

  function readCache () {
    try {
      var raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      var data = JSON.parse(raw)
      if (!data) return null
      var ttl = data.unknown ? FAIL_CACHE_TTL : CACHE_TTL
      if (Date.now() - data.timestamp > ttl) return null
      return data
    } catch (e) {
      return null
    }
  }

  function writeCache (payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.assign({ timestamp: Date.now() }, payload)))
    } catch (e) {}
  }

  function ensureAsideWidget () {
    var asideContent = document.getElementById('aside-content')
    if (!asideContent) return null

    var widget = document.getElementById(ASIDE_ID)
    if (widget) return widget

    widget = document.createElement('div')
    widget.id = ASIDE_ID
    widget.className = 'card-widget card-distance'
    widget.setAttribute('aria-live', 'polite')

    var cardAuthor = asideContent.querySelector('.card-info')
    if (cardAuthor) {
      cardAuthor.insertAdjacentElement('afterend', widget)
    } else {
      asideContent.insertBefore(widget, asideContent.firstChild)
    }
    return widget
  }

  function ensureHeroBottomStack (header) {
    var stack = document.getElementById('hero-bottom-stack')
    if (stack) return stack
    stack = document.createElement('div')
    stack.id = 'hero-bottom-stack'
    stack.className = 'hero-bottom-stack'
    header.appendChild(stack)
    return stack
  }

  function ensureHeroWidget () {
    var header = document.getElementById('page-header')
    if (!header || !header.classList.contains('full_page')) return null

    var stack = ensureHeroBottomStack(header)
    var widget = document.getElementById(HERO_ID)
    if (widget) {
      if (widget.parentElement !== stack) stack.appendChild(widget)
      return widget
    }

    widget = document.createElement('div')
    widget.id = HERO_ID
    widget.className = 'hero-distance'
    widget.setAttribute('aria-live', 'polite')
    stack.appendChild(widget)
    return widget
  }

  function stateSignature (state, isMobile) {
    return [
      state.loading ? '1' : '0',
      state.distance == null ? 'null' : String(state.distance),
      state.city || '',
      state.country || '',
      state.poem || '',
      isMobile ? 'm' : 'd'
    ].join('|')
  }

  function renderState (state, force) {
    var distance = state.distance
    var city = state.city || ''
    var country = state.country || ''
    var loading = !!state.loading
    var hasDistance = typeof distance === 'number' && !isNaN(distance)
    var isMobile = window.matchMedia('(max-width: 768px)').matches
    var sig = stateSignature(state, isMobile)

    var poem = loading
      ? '正在测量风与云的距离…'
      : (state.poem || buildPoem(hasDistance ? distance : null, city))

    var placeBits = [city, country].filter(Boolean)
    var placeLine = placeBits.length ? placeBits.map(escapeHtml).join(' · ') : (loading ? '定位中' : '远方')

    var metricHtml = hasDistance
      ? (
        '<div class="distance-metric">' +
          '<span class="distance-metric__value">' + distance + '</span>' +
          '<span class="distance-metric__unit">公里</span>' +
        '</div>' +
        '<p class="distance-metric__caption">距 ' + escapeHtml(HOST.city) + '（' + escapeHtml(HOST.label) + '）</p>'
      )
      : (
        '<div class="distance-metric distance-metric--soft">' +
          '<span class="distance-metric__value distance-metric__value--text">' + (loading ? '…' : '远方') + '</span>' +
        '</div>' +
        '<p class="distance-metric__caption">' + (loading ? '正在估算与你的距离' : '坐标未明，心意可感') + '</p>'
      )

    var retryBtn = (!loading && !hasDistance)
      ? '<button type="button" class="distance-retry" data-distance-retry>重试定位</button>'
      : ''

    var aside = ensureAsideWidget()
    if (aside && (force || aside.dataset.renderedSig !== sig)) {
      aside.dataset.renderedSig = sig
      aside.innerHTML =
        '<div class="item-headline">' +
          '<span>山海距离</span>' +
        '</div>' +
        '<div class="distance-content' + (loading ? ' distance-content--loading' : '') + '">' +
          metricHtml +
          '<p class="distance-place">' + placeLine + '</p>' +
          '<p class="distance-text">' + poem + '</p>' +
          '<div class="distance-footer">' +
            '<span class="distance-tag">IP 粗定位 · 非 GPS · 仅作诗意点缀</span>' +
            retryBtn +
          '</div>' +
        '</div>'
    }

    var hero = ensureHeroWidget()
    if (hero && (force || hero.dataset.renderedSig !== sig)) {
      hero.dataset.renderedSig = sig
      var heroMain
      if (hasDistance) {
        if (isMobile) {
          heroMain = '约 <strong>' + distance + '</strong> km' +
            (city ? ' · ' + escapeHtml(city) : '')
        } else {
          heroMain = '约 <strong>' + distance + '</strong> 公里' +
            (city ? ' · ' + escapeHtml(city) : '') +
            ' · 网络估算'
        }
      } else if (loading) {
        heroMain = isMobile ? '正在测距…' : '正在测量与你的山海距离…'
      } else {
        heroMain = isMobile ? '风从远方来' : '风从远方来，欢迎来到这里'
      }
      hero.innerHTML =
        '<div class="hero-distance__inner">' +
          '<span class="hero-distance__text">' + heroMain + '</span>' +
        '</div>'
    }
  }

  var lastState = null
  var geoStarted = false
  var mountTimer = null

  function paint (state) {
    if (!state.loading && !state.poem) {
      var hasDistance = typeof state.distance === 'number' && !isNaN(state.distance)
      state.poem = buildPoem(hasDistance ? state.distance : null, state.city || '')
    }
    lastState = state
    renderState(state, false)
  }

  function applyGeo (geo) {
    if (!geo) {
      var fallback = { distance: null, city: '', country: '', loading: false }
      writeCache({ distance: null, city: '', country: '', unknown: true })
      paint(fallback)
      return
    }

    var distance = haversineKm(HOST.lat, HOST.lng, geo.lat, geo.lng)
    var payload = {
      distance: distance,
      city: geo.city || geo.region || '',
      country: geo.country || '',
      loading: false
    }
    writeCache({
      distance: payload.distance,
      city: payload.city,
      country: payload.country,
      unknown: false
    })
    paint(payload)
  }

  function startGeoOnce (forceRefresh) {
    if (geoStarted && !forceRefresh) return
    geoStarted = true
    resolveVisitorGeo().then(function (geo) {
      applyGeo(geo)
    })
  }

  function mountAndLoad () {
    var cached = readCache()
    if (cached) {
      var sameCache = lastState && !lastState.loading &&
        lastState.distance === (cached.unknown ? null : cached.distance) &&
        (lastState.city || '') === (cached.city || '')
      if (sameCache) {
        renderState(lastState, false)
        return
      }
      paint({
        distance: cached.unknown ? null : cached.distance,
        city: cached.city || '',
        country: cached.country || '',
        loading: false
      })
      return
    }

    if (lastState) {
      renderState(lastState, false)
    } else {
      paint({ distance: null, city: '', country: '', loading: true })
    }
    startGeoOnce(false)
  }

  function containersReady () {
    var header = document.getElementById('page-header')
    var needHero = header && header.classList.contains('full_page')
    var hasHero = !needHero || Boolean(document.getElementById(HERO_ID))
    var aside = document.getElementById('aside-content')
    var hasAside = !aside || Boolean(document.getElementById(ASIDE_ID))
    return hasHero && hasAside && (Boolean(aside) || Boolean(header))
  }

  function initUserDistance () {
    if (mountTimer) {
      window.clearInterval(mountTimer)
      mountTimer = null
    }

    mountAndLoad()
    if (containersReady()) return

    var tries = 0
    mountTimer = window.setInterval(function () {
      tries += 1
      if (lastState) renderState(lastState, false)
      else mountAndLoad()
      if (containersReady() || tries >= 8) {
        window.clearInterval(mountTimer)
        mountTimer = null
      }
    }, 300)
  }

  document.addEventListener('click', function (event) {
    var btn = event.target && event.target.closest && event.target.closest('[data-distance-retry]')
    if (!btn) return
    try { localStorage.removeItem(CACHE_KEY) } catch (e) {}
    paint({ distance: null, city: '', country: '', loading: true })
    startGeoOnce(true)
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserDistance)
  } else {
    initUserDistance()
  }

  document.addEventListener('pjax:complete', initUserDistance)

  window.addEventListener('resize', function () {
    window.clearTimeout(window.__userDistanceResizeTimer)
    window.__userDistanceResizeTimer = window.setTimeout(function () {
      if (lastState) renderState(lastState, false)
    }, 150)
  })
})()
