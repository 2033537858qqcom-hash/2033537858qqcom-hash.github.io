/**
 * 轻盈点击微粒：
 * - 白天点击散开几片微型樱瓣，夜晚点击散开几颗柔光星芒
 * - 全站生效，自动避开交互控件、看板娘与文本划选，并尊重 prefers-reduced-motion
 */
(function () {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let bound = false

  const ignoredSelector =
    'input, textarea, select, option, [contenteditable="true"], .aplayer, .aplayer *, a, button, summary, [role="button"], .shuoshuo-comment-btn, #live2d-widget, #live2dcanvas'

  const hasSelection = () => {
    try {
      return Boolean(window.getSelection && window.getSelection().toString().trim())
    } catch (e) {
      return false
    }
  }

  const spawnBloom = event => {
    if (reduceMotion.matches) return
    if (event.button !== 0) return
    if (hasSelection()) return
    if (event.target.closest && event.target.closest(ignoredSelector)) return

    const isDark = root.getAttribute('data-theme') === 'dark'
    const count = 5
    const frag = document.createDocumentFragment()
    const created = []

    for (let i = 0; i < count; i += 1) {
      const spark = document.createElement('span')
      spark.className = 'click-spark ' + (isDark ? 'click-spark--star' : 'click-spark--petal')
      spark.setAttribute('aria-hidden', 'true')

      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.7 - 0.35)
      const dist = 20 + Math.random() * 24
      const dx = Math.cos(angle) * dist
      const dy = Math.sin(angle) * dist + (isDark ? -6 : 10)
      const rot = Math.round(Math.random() * 200 - 100) + 'deg'
      const scale = (0.75 + Math.random() * 0.5).toFixed(2)

      spark.style.left = event.clientX + 'px'
      spark.style.top = event.clientY + 'px'
      spark.style.setProperty('--spark-x', dx.toFixed(1) + 'px')
      spark.style.setProperty('--spark-y', dy.toFixed(1) + 'px')
      spark.style.setProperty('--spark-rot', rot)
      spark.style.setProperty('--spark-scale', scale)

      frag.appendChild(spark)
      created.push(spark)
    }

    document.body.appendChild(frag)
    window.setTimeout(() => {
      for (let i = 0; i < created.length; i += 1) created[i].remove()
    }, 760)
  }

  const bind = () => {
    if (bound) return
    bound = true
    document.addEventListener('click', spawnBloom, true)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true })
  } else {
    bind()
  }
})()
