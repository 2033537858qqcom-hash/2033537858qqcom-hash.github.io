/**
 * 子页面轻量交互增强（支持 PJAX 重新挂载）：
 * - 番剧页：状态筛选 + 「手气挑一部」卡片高亮
 * - 摄影页：正序 / 倒序切换
 * - 人生长廊：年份顺序正序 / 倒序切换
 * - 404 页：补充回首页 / 随笔 / 摄影 / 时间轴与站内搜索引导
 */
(function () {
  let animePickTimer = 0
  let lastPickedId = ''

  const initAnime = () => {
    const page = document.querySelector('.anime-page')
    if (!page || page.dataset.animeBound === '1') return
    page.dataset.animeBound = '1'

    const cards = [...page.querySelectorAll('.anime-card')]
    const buttons = [...page.querySelectorAll('[data-anime-status]')]
    const empty = page.querySelector('.anime-empty')
    const pickBtn = document.getElementById('anime-pick-btn')

    const applyStatus = status => {
      let visible = 0
      cards.forEach(card => {
        const match = !status || (card.dataset.status || '') === status
        card.hidden = !match
        if (match) visible += 1
      })
      buttons.forEach(btn => {
        const active = (btn.dataset.animeStatus || '') === status
        btn.classList.toggle('is-active', active)
        btn.setAttribute('aria-pressed', active ? 'true' : 'false')
      })
      if (empty) empty.hidden = visible > 0
    }

    page.addEventListener('click', event => {
      const btn = event.target.closest && event.target.closest('[data-anime-status]')
      if (!btn || !page.contains(btn)) return
      applyStatus(btn.dataset.animeStatus || '')
    })

    if (pickBtn) {
      pickBtn.addEventListener('click', () => {
        let pool = cards.filter(c => !c.hidden)
        if (!pool.length) {
          applyStatus('')
          pool = cards
        }
        if (!pool.length) return
        const filtered = pool.length > 1 ? pool.filter(c => c.id !== lastPickedId) : pool
        const picked = filtered[Math.floor(Math.random() * filtered.length)]
        lastPickedId = picked.id

        cards.forEach(c => c.classList.remove('is-picked'))
        window.clearTimeout(animePickTimer)
        picked.classList.add('is-picked')
        picked.scrollIntoView({ behavior: 'smooth', block: 'center' })
        animePickTimer = window.setTimeout(() => picked.classList.remove('is-picked'), 2600)

        try {
          window.dispatchEvent(new CustomEvent('blog:anime-pick', {
            detail: { title: picked.dataset.title || '' }
          }))
        } catch (e) { /* ignore */ }
      })
    }
  }

  const initPhotographyOrder = () => {
    const btn = document.getElementById('photo-order-toggle')
    const container = document.getElementById('photo-years')
    const nav = document.querySelector('.photo-nav')
    if (!btn || !container || btn.dataset.orderBound === '1') return
    btn.dataset.orderBound = '1'

    btn.addEventListener('click', () => {
      const next = btn.dataset.order === 'asc' ? 'desc' : 'asc'
      btn.dataset.order = next
      btn.classList.toggle('is-asc', next === 'asc')

      const label = btn.querySelector('span')
      if (label) label.textContent = next === 'asc' ? '正序 · 从旧到新' : '倒序 · 近照优先'

      const sections = [...container.querySelectorAll('.photo-year')].reverse()
      sections.forEach(sec => {
        const grid = sec.querySelector('.photo-grid')
        if (grid) {
          const cards = [...grid.children].reverse()
          cards.forEach(card => grid.appendChild(card))
        }
        container.appendChild(sec)
      })

      if (nav) {
        const pills = [...nav.querySelectorAll('.photo-nav__pill')].reverse()
        pills.forEach(pill => nav.insertBefore(pill, btn))
      }
    })
  }

  const initTimelineOrder = () => {
    const btn = document.getElementById('tl-order-toggle')
    const line = document.querySelector('.timeline-page .tl-line')
    const nav = document.querySelector('.tl-hero__nav')
    if (!btn || !line || btn.dataset.orderBound === '1') return
    btn.dataset.orderBound = '1'

    btn.addEventListener('click', () => {
      const next = btn.dataset.order === 'desc' ? 'asc' : 'desc'
      btn.dataset.order = next
      btn.classList.toggle('is-desc', next === 'desc')

      const label = btn.querySelector('span')
      if (label) label.textContent = next === 'desc' ? '2026 → 2023' : '2023 → 2026'

      const years = [...line.querySelectorAll('.tl-year')].reverse()
      years.forEach(yr => line.appendChild(yr))

      if (nav) {
        const pills = [...nav.querySelectorAll('a')].reverse()
        pills.forEach(pill => nav.insertBefore(pill, btn))
      }
    })
  }

  const initErrorGuide = () => {
    const info = document.querySelector('#error-wrap .error-info')
    if (!info || info.dataset.guided === '1') return
    info.dataset.guided = '1'

    const box = document.createElement('div')
    box.className = 'error-404-links'
    box.setAttribute('aria-label', '常用站内直达入口')

    const routes = [
      { href: '/moments/', text: '去读随笔' },
      { href: '/photography/', text: '看摄影集' },
      { href: '/timeline/', text: '逛人生长廊' },
      { href: '/anime/', text: '翻番剧记录' }
    ]

    routes.forEach(r => {
      const a = document.createElement('a')
      a.href = r.href
      a.textContent = r.text
      box.appendChild(a)
    })

    const searchTrigger = document.querySelector('#search-button a, .site-page.social-icon.search')
    if (searchTrigger) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = '站内搜索'
      btn.addEventListener('click', () => searchTrigger.click())
      box.appendChild(btn)
    }

    info.appendChild(box)
  }

  const boot = () => {
    initAnime()
    initPhotographyOrder()
    initTimelineOrder()
    initErrorGuide()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
  document.addEventListener('pjax:complete', boot)
})()
