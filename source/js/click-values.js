;(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) return

  const root = document.documentElement
  let lastTriggerAt = 0

  const resolveSparkClass = () => {
    const isDark = root.getAttribute('data-theme') === 'dark'
    const scene = root.getAttribute('data-sanctuary-scene') || ''
    if (isDark || scene === 'night') return 'click-spark--star'
    if (scene === 'autumn') return 'click-spark--ginkgo'
    if (scene === 'winter') return 'click-spark--snow'
    if (scene === 'rain') return 'click-spark--rain'
    if (scene === 'summer') return 'click-spark--firefly'
    return 'click-spark--petal'
  }

  const spawnMicroSparks = (x, y) => {
    const body = document.body
    if (!body) return

    const variantClass = resolveSparkClass()
    const count = 5
    const frag = document.createDocumentFragment()
    const created = []

    for (let i = 0; i < count; i += 1) {
      const spark = document.createElement('span')
      spark.className = 'click-spark ' + variantClass

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
      const distance = 16 + Math.random() * 18
      const dx = Math.cos(angle) * distance
      const dy = Math.sin(angle) * distance - (variantClass === 'click-spark--star' ? 6 : 2)
      const rot = Math.round((Math.random() - 0.5) * 140)
      const scale = (0.75 + Math.random() * 0.45).toFixed(2)

      spark.style.left = `${x}px`
      spark.style.top = `${y}px`
      spark.style.setProperty('--spark-x', `${dx.toFixed(1)}px`)
      spark.style.setProperty('--spark-y', `${dy.toFixed(1)}px`)
      spark.style.setProperty('--spark-rot', `${rot}deg`)
      spark.style.setProperty('--spark-scale', scale)

      frag.appendChild(spark)
      created.push(spark)
    }

    body.appendChild(frag)
    window.setTimeout(() => {
      created.forEach(node => node.remove())
    }, 650)
  }

  document.addEventListener(
    'click',
    event => {
      const now = performance.now()
      if (now - lastTriggerAt < 90) return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'a, button, input, textarea, select, summary, label, [role="button"], .aplayer, .fancybox__container, #live2d-widget, #sanctuary-dock, #sanctuary-music, #sanctuary-music-studio, #sanctuary-rest-overlay, #post-comment'
        )
      ) {
        return
      }
      lastTriggerAt = now
      spawnMicroSparks(event.clientX, event.clientY)
    },
    { passive: true }
  )
})()
