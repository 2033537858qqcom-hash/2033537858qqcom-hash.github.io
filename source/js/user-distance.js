/**
 * Visitor distance widget (IP geolocation, no browser GPS).
 * Fails silently when the API is unavailable.
 */
(function () {
  // Host coordinates (Shanghai default). Update if needed.
  const HOST_LAT = 31.2304
  const HOST_LNG = 121.4737
  const CACHE_KEY = 'user_distance_cache_v2'
  const CACHE_TTL = 24 * 60 * 60 * 1000

  function calculateDistance (lat1, lon1, lat2, lon2) {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c)
  }

  function getLiteraryMessage (distance, city) {
    const locationText = city
      ? `来自 <strong class="distance-highlight">${city}</strong> 的朋友，`
      : '亲爱的朋友，'

    if (distance < 50) {
      return `${locationText}我们身处同一座城市。相距仅 <strong class="distance-highlight">${distance}</strong> 公里，好巧，能在代码与文字中相遇。`
    }
    if (distance < 600) {
      return `${locationText}跨越了 <strong class="distance-highlight">${distance}</strong> 公里的风与云，很高兴你能停下脚步，与我同赏这片风景。`
    }
    if (distance < 2000) {
      return `${locationText}你与我相隔 <strong class="distance-highlight">${distance}</strong> 公里。跨越山海与山川，文字总能触及彼此的心灵。`
    }
    return `${locationText}纵使我们相距 <strong class="distance-highlight">${distance}</strong> 公里，但仰望的依然是同一片星空。`
  }

  function escapeHtml (value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderDistanceWidget (distance, city) {
    const asideContent = document.getElementById('aside-content')
    if (!asideContent) return

    let widget = document.getElementById('card-user-distance')
    if (!widget) {
      widget = document.createElement('div')
      widget.id = 'card-user-distance'
      widget.className = 'card-widget card-distance'

      const cardAuthor = asideContent.querySelector('.card-info')
      if (cardAuthor && cardAuthor.nextSibling) {
        asideContent.insertBefore(widget, cardAuthor.nextSibling)
      } else {
        asideContent.appendChild(widget)
      }
    }

    const safeCity = escapeHtml(city)
    const message = getLiteraryMessage(distance, safeCity)
    widget.innerHTML = `
      <div class="item-headline">
        <i class="fas fa-compass fa-spin-hover"></i>
        <span>山海距离</span>
      </div>
      <div class="distance-content">
        <p class="distance-text">${message}</p>
        <div class="distance-footer">
          <span class="distance-tag"><i class="fas fa-paper-plane"></i> 基于 IP 粗略估算</span>
        </div>
      </div>
    `
  }

  function removeDistanceWidget () {
    const widget = document.getElementById('card-user-distance')
    if (widget) widget.remove()
  }

  function readCache () {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!data || typeof data.distance !== 'number') return null
      if (Date.now() - data.timestamp > CACHE_TTL) return null
      return data
    } catch (e) {
      return null
    }
  }

  function writeCache (distance, city) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ distance, city, timestamp: Date.now() })
      )
    } catch (e) {}
  }

  function fetchWithTimeout (url, ms) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = window.setTimeout(() => {
      if (controller) controller.abort()
    }, ms)

    return fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(res => {
        window.clearTimeout(timer)
        if (!res.ok) throw new Error('bad status')
        return res.json()
      })
      .catch(err => {
        window.clearTimeout(timer)
        throw err
      })
  }

  function initUserDistance () {
    if (window.matchMedia('(prefers-reduced-data: reduce)').matches) {
      removeDistanceWidget()
      return
    }

    const cached = readCache()
    if (cached) {
      renderDistanceWidget(cached.distance, cached.city || '')
      return
    }

    fetchWithTimeout('https://ipapi.co/json/', 4000)
      .then(data => {
        if (!data || data.error || data.latitude == null || data.longitude == null) {
          throw new Error('invalid geo')
        }
        const distance = calculateDistance(
          HOST_LAT,
          HOST_LNG,
          Number(data.latitude),
          Number(data.longitude)
        )
        const city = data.city || data.region || ''
        writeCache(distance, city)
        renderDistanceWidget(distance, city)
      })
      .catch(() => {
        // Do not invent distances; hide the widget when geolocation fails.
        removeDistanceWidget()
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserDistance)
  } else {
    initUserDistance()
  }

  document.addEventListener('pjax:complete', initUserDistance)
})()
