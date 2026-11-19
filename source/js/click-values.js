/**
 * 点击显示社会主义核心价值观词语：仅文章页，且尊重减少动效与划选文本。
 */
(function () {
  const words = ['富强', '民主', '文明', '和谐', '自由', '平等', '公正', '法治', '爱国', '敬业', '诚信', '友善']
  let index = 0
  let bound = false

  const ignoredSelector =
    'input, textarea, select, option, [contenteditable="true"], .aplayer, .aplayer *, a, button, summary, [role="button"], .shuoshuo-comment-btn'

  const isPostPage = () => Boolean(document.getElementById('post'))

  const hasSelection = () => {
    try {
      return Boolean(window.getSelection && window.getSelection().toString().trim())
    } catch (e) {
      return false
    }
  }

  const showWord = event => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!isPostPage()) return
    if (event.button !== 0) return
    if (hasSelection()) return
    if (event.target.closest && event.target.closest(ignoredSelector)) return

    const word = document.createElement('span')
    word.className = 'core-value-click-word'
    word.setAttribute('aria-hidden', 'true')
    word.textContent = words[index]
    index = (index + 1) % words.length
    word.style.left = event.clientX + 'px'
    word.style.top = event.clientY + 'px'
    word.style.setProperty('--word-x', (Math.random() * 16 - 8) + 'px')
    document.body.appendChild(word)
    window.setTimeout(() => word.remove(), 1200)
  }

  const bind = () => {
    if (bound) return
    bound = true
    document.addEventListener('click', showWord, true)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true })
  } else {
    bind()
  }
})()
