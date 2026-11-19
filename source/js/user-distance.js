/**
 * 访客与站长的山海距离
 * - 不申请浏览器 GPS，仅用 IP 粗定位
 * - 仅在首页头图底部渲染一行轻量距离问候，不在侧栏堆放指标卡片
 */
(function () {
  // 站长锚点：杭州
  const HOST = {
    lat: 30.2741,
    lng: 120.1551,
    city: '杭州'
  }

  const CACHE_KEY = 'user_distance_cache_v6'
  const CACHE_TTL = 24 * 60 * 60 * 1000
  const FAIL_CACHE_TTL = 10 * 60 * 1000
  const HERO_ID = 'hero-user-distance'

  const CITY_ZH = {
    hangzhou: '杭州',
    shanghai: '上海',
    beijing: '北京',
    shenzhen: '深圳',
    guangzhou: '广州',
    chengdu: '成都',
    wuhan: '武汉',
    nanjing: '南京',
    xian: '西安',
    "xi'an": '西安',
    suzhou: '苏州',
    chongqing: '重庆',
    tianjin: '天津',
    changsha: '长沙',
    zhengzhou: '郑州',
    qingdao: '青岛',
    xiamen: '厦门',
    kunming: '昆明',
    harbin: '哈尔滨',
    dalian: '大连',
    shenyang: '沈阳',
    jinan: '济南',
    fuzhou: '福州',
    hefei: '合肥',
    ningbo: '宁波',
    wuxi: '无锡',
    zhuhai: '珠海',
    dongguan: '东莞',
    foshan: '佛山',
    wenzhou: '温州',
    nanchang: '南昌',
    taiyuan: '太原',
    shijiazhuang: '石家庄',
    nanning: '南宁',
    guiyang: '贵阳',
    lanzhou: '兰州',
    haikou: '海口',
    sanya: '三亚',
    'hong kong': '香港',
    taipei: '台北',
    macau: '澳门',
    tokyo: '东京',
    osaka: '大阪',
    kyoto: '京都',
    singapore: '新加坡',
    seoul: '首尔',
    london: '伦敦',
    paris: '巴黎',
    frankfurt: '法兰克福',
    berlin: '柏林',
    'new york': '纽约',
    'los angeles': '洛杉矶',
    'san francisco': '旧金山',
    seattle: '西雅图',
    sydney: '悉尼',
    melbourne: '墨尔本',
    toronto: '多伦多',
    vancouver: '温哥华'
  }

  function localizeCity (name) {
    var raw = String(name || '').trim()
    if (!raw) return ''
    var key = raw.toLowerCase().replace(/\s+city$/i, '')
    return CITY_ZH[key] || raw
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
      isMobile ? 'm' : 'd'
    ].join('|')
  }

  function renderState (state, force) {
    var hero = ensureHeroWidget()
    if (!hero) return
    var distance = state.distance
    var city = localizeCity(state.city || '')
    var loading = !!state.loading
    var hasDistance = typeof distance === 'number' && !isNaN(distance)
    var isMobile = window.matchMedia('(max-width: 768px)').matches
    var sig = stateSignature(state, isMobile)
    if (!force && hero.dataset.renderedSig === sig) return

    hero.dataset.renderedSig = sig
    var heroMain
    if (hasDistance) {
      if (isMobile) {
        heroMain = '约 <strong>' + distance + '</strong> km' +
          (city ? ' · ' + escapeHtml(city) : '')
      } else {
        heroMain = '约 <strong>' + distance + '</strong> 公里' +
          (city ? ' · ' + escapeHtml(city) : '')
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

  var lastState = null
  var geoStarted = false
  var mountTimer = null

  function paint (state) {
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
    if (!header || !header.classList.contains('full_page')) return true
    return Boolean(document.getElementById(HERO_ID))
  }

  function initUserDistance () {
    if (mountTimer) {
      window.clearInterval(mountTimer)
      mountTimer = null
    }

    var header = document.getElementById('page-header')
    if (!header || !header.classList.contains('full_page')) return

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
