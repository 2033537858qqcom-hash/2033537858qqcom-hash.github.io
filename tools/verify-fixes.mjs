import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const hashOf = rel => {
  const buf = fs.readFileSync(path.join('source', rel))
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)
}

const cssHash = hashOf('css/custom.css')
const cursorHash = hashOf('js/cursor-enhance.js')

const index = fs.readFileSync('public/index.html', 'utf8')
const atom = fs.readFileSync('public/atom.xml', 'utf8')
const search = fs.readFileSync('public/search.xml', 'utf8')
const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8')
const archive = fs.readFileSync('public/archives/index.html', 'utf8')
const photography = fs.readFileSync('public/photography/index.html', 'utf8')
const timeline = fs.readFileSync('public/timeline/index.html', 'utf8')
const anime = fs.readFileSync('public/anime/index.html', 'utf8')
const moments = fs.readFileSync('public/moments/index.html', 'utf8')
const music = fs.readFileSync('public/music/index.html', 'utf8')
const about = fs.readFileSync('public/about/index.html', 'utf8')
const message = fs.readFileSync('public/message/index.html', 'utf8')
const links = fs.readFileSync('public/links/index.html', 'utf8')
const page404 = fs.readFileSync('public/404.html', 'utf8')
const article = fs.readFileSync('public/2026/07/22/what-i-write-here/index.html', 'utf8')
const setupNotes = fs.readFileSync('public/2026/05/13/blog-setup-notes/index.html', 'utf8')

const checks = []
const ok = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail })
  console.log((pass ? 'OK  ' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''))
}

ok('asset css content hash', index.includes(`custom.css?v=${cssHash}`), cssHash)
ok('asset cursor content hash', index.includes(`cursor-enhance.js?v=${cursorHash}`), cursorHash)
ok('wechat icon & script', index.includes('fab fa-weixin') && index.includes('wechat-contact.js'))
ok('click-values injected', index.includes('click-values.js'))
ok('no hide-body preloader css', !index.includes('html:not(.site-loaded) body'))
ok('no hidden on home', !index.includes('blog-setup-notes') && !index.includes('butterfly-page-structure') && !index.includes('anime-page-plan'))
ok('home shows what-i-write-here', index.includes('what-i-write-here'))
ok('no hidden in atom', !atom.includes('blog-setup-notes'))
ok('no hidden in search', !search.includes('blog-setup-notes'))
ok('no hidden in sitemap', !sitemap.includes('blog-setup-notes'))
ok('search includes moments & anime & timeline', search.includes('随笔 ·') && search.includes('番剧 ·') && search.includes('人生长廊 ·'))
ok('archive still has hidden (series access)', archive.includes('blog-setup-notes') || archive.includes('博客搭建'))
ok('related & prev/next hide notes on public article', !article.includes('blog-setup-notes') && !article.includes('anime-page-plan'))
ok('blog-setup-notes heading not wrapped in list', !setupNotes.includes('<li><h2'))
ok('busuanzi https', index.includes('https://busuanzi.ibruce.info'))
ok('favicon & apple-touch-icon', fs.existsSync('public/img/favicon.ico') && index.includes('apple-touch-icon.png'))
ok('hangzhou in distance js', fs.readFileSync('public/js/user-distance.js', 'utf8').includes('杭州'))
ok('hero-latest no innerHTML assign', !fs.readFileSync('public/js/hero-latest.js', 'utf8').includes('innerHTML ='))

const photoYearCount = (photography.match(/class="photo-year"/g) || []).length
const photoCardCount = (photography.match(/class="photo-card"/g) || []).length
const photoJpgCount = fs.readdirSync('public/img/photography').filter(f => f.toLowerCase().endsWith('.jpg')).length
ok('photography exact 5 year groups (no double inject)', photoYearCount === 5, `years=${photoYearCount}`)
ok('photography exact 134 photo cards', photoCardCount === 134, `cards=${photoCardCount}`)
ok('photography no unused jpg deployed', photoJpgCount === 0, `jpg=${photoJpgCount}`)
ok('photography dimensions on img', /class="photo-card"[\s\S]*?width="\d+" height="\d+"/.test(photography))
ok('photography no placeholder', !photography.includes('<!-- photo-list -->'))
ok('photography fancybox', photography.includes('data-fancybox="photography"'))

ok('home now block', index.includes('class="home-now"'))
ok('search quiet placeholder', index.includes('找一篇随笔，或一个名字'))
ok('search title restyle', index.includes('在文字里找'))
ok('moments page & script', moments.includes('id="shuoshuo-data"') && fs.readFileSync('public/js/moments-years.js', 'utf8').includes('moment-year'))
ok('music page rendered', music.includes('netease-embed'))
ok('timeline page rendered', timeline.includes('class="timeline-page"') && timeline.includes('day-night-theme-design') && !timeline.includes('blog-setup-notes'))
ok('anime page rendered', anime.includes('class="anime-page"') && anime.includes('id="anime-0"') && !anime.includes('点进去读两句短评'))
ok('about/message/links/404 exist', about.length > 0 && message.includes('data-wechat-copy') && links.length > 0 && page404.length > 0)

// Check all local /img/... references in primary pages exist in public/
const pagesToCheck = [
  ['index', index],
  ['404', page404],
  ['anime', anime],
  ['timeline', timeline],
  ['photography', photography],
  ['about', about],
  ['links', links]
]
const missingImgs = []
for (const [label, html] of pagesToCheck) {
  for (const m of html.matchAll(/(?:src|href)=["'](\/img\/[^"'?#]+)["']/g)) {
    const rel = m[1].replace(/^\//, '')
    if (!fs.existsSync(path.join('public', decodeURIComponent(rel)))) {
      missingImgs.push(`${label}: /${rel}`)
    }
  }
}
ok('all referenced /img/* files exist in public/', missingImgs.length === 0, missingImgs.join(', '))

const failed = checks.filter(c => !c.pass)
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' passed')
if (failed.length) process.exit(1)
