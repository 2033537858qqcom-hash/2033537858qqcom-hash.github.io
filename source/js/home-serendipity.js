/**
 * 首页「任意门 · 记忆切片」：
 * - 首屏优先结合访客当前月日匹配「往年今日 / 往年本月」，无匹配则随机抽出一条温暖切片
 * - 点击「换一条」不重复抽签，支持 PJAX 切回首页重新挂载
 */
(function () {
  const renderItem = (root, item, labelOverride) => {
    const link = document.getElementById('home-serendipity-link')
    const badge = document.getElementById('home-serendipity-badge')
    const meta = document.getElementById('home-serendipity-meta')
    const text = document.getElementById('home-serendipity-text')
    if (!link || !badge || !meta || !text || !item) return

    link.setAttribute('href', item.url || '/moments/')
    badge.textContent = labelOverride || item.badge || '此刻任意门'
    badge.dataset.kind = item.kind || 'moment'
    meta.textContent = item.meta || ''
    text.textContent = item.text || ''

    const existingThumb = link.querySelector('.home-serendipity__thumb')
    if (item.img) {
      const thumb = existingThumb || document.createElement('img')
      thumb.className = 'home-serendipity__thumb'
      thumb.src = item.img
      thumb.alt = item.meta || '摄影切片'
      thumb.loading = 'lazy'
      thumb.decoding = 'async'
      if (!existingThumb) link.insertBefore(thumb, link.firstChild)
    } else if (existingThumb) {
      existingThumb.remove()
    }
  }

  const pickInitial = pool => {
    const now = new Date()
    const month = now.getMonth() + 1
    const day = now.getDate()

    const sameDay = []
    const sameMonth = []
    for (let i = 0; i < pool.length; i += 1) {
      const item = pool[i]
      if (item.month === month && item.day === day) sameDay.push(i)
      else if (item.month === month) sameMonth.push(i)
    }

    if (sameDay.length) {
      const index = sameDay[Math.floor(Math.random() * sameDay.length)]
      return { index, label: '往年今日' }
    }
    if (sameMonth.length) {
      const index = sameMonth[Math.floor(Math.random() * sameMonth.length)]
      return { index, label: '往年本月' }
    }
    const index = Math.floor(Math.random() * pool.length)
    return { index, label: '' }
  }

  const init = () => {
    const root = document.getElementById('home-serendipity')
    const dataEl = document.getElementById('home-serendipity-data')
    const rollBtn = document.getElementById('home-serendipity-roll')
    if (!root || !dataEl || !rollBtn || root.dataset.serendipityBound === '1') return

    let pool = []
    try {
      const parsed = JSON.parse(dataEl.textContent || '[]')
      if (Array.isArray(parsed)) pool = parsed
    } catch (e) {
      return
    }
    if (!pool.length) return

    root.dataset.serendipityBound = '1'
    let current = pickInitial(pool)
    let lastIndex = current.index
    renderItem(root, pool[lastIndex], current.label)

    rollBtn.addEventListener('click', () => {
      if (pool.length <= 1) return
      let nextIndex = lastIndex
      for (let attempt = 0; attempt < 6 && nextIndex === lastIndex; attempt += 1) {
        nextIndex = Math.floor(Math.random() * pool.length)
      }
      if (nextIndex === lastIndex) nextIndex = (lastIndex + 1) % pool.length
      lastIndex = nextIndex
      const picked = pool[nextIndex]
      renderItem(root, picked, '')

      rollBtn.classList.remove('is-rolling')
      void rollBtn.offsetWidth
      rollBtn.classList.add('is-rolling')

      try {
        window.dispatchEvent(new CustomEvent('blog:serendipity', { detail: picked }))
      } catch (e) { /* ignore */ }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
  document.addEventListener('pjax:complete', init)
})()
