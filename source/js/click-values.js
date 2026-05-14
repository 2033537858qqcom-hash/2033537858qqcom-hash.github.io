(function () {
  const words = ['富强', '民主', '文明', '和谐', '自由', '平等', '公正', '法治', '爱国', '敬业', '诚信', '友善']
  let index = 0

  const ignoredSelector = 'input, textarea, select, option, [contenteditable="true"], .aplayer, .aplayer *'

  const showWord = event => {
    if (event.button !== 0 || event.target.closest(ignoredSelector)) return

    const word = document.createElement('span')
    word.className = 'core-value-click-word'
    word.textContent = words[index]
    index = (index + 1) % words.length

    word.style.left = `${event.clientX}px`
    word.style.top = `${event.clientY}px`
    word.style.setProperty('--word-x', `${Math.random() * 16 - 8}px`)

    document.body.appendChild(word)
    window.setTimeout(() => word.remove(), 1200)
  }

  document.addEventListener('click', showWord, true)
})()
