import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const version = pkg.version
const index = fs.readFileSync('public/index.html', 'utf8')
const atom = fs.readFileSync('public/atom.xml', 'utf8')
const search = fs.readFileSync('public/search.xml', 'utf8')
const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8')
const archive = fs.readFileSync('public/archives/index.html', 'utf8')
const photography = fs.readFileSync('public/photography/index.html', 'utf8')
const article = fs.readFileSync('public/2026/07/22/what-i-write-here/index.html', 'utf8')

const checks = []
const ok = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail })
  console.log((pass ? 'OK  ' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''))
}

ok('asset css version', index.includes(`custom.css?v=${version}`), version)
ok('asset cursor version', index.includes(`cursor-enhance.js?v=${version}`), version)
ok('click-values injected', index.includes('click-values.js'))
ok('no hide-body preloader css', !index.includes('html:not(.site-loaded) body'))
ok('no hidden on home', !index.includes('blog-setup-notes') && !index.includes('butterfly-page-structure'))
ok('no hidden in atom', !atom.includes('blog-setup-notes'))
ok('no hidden in search', !search.includes('blog-setup-notes'))
ok('no hidden in sitemap', !sitemap.includes('blog-setup-notes'))
ok('archive still has hidden (series access)', archive.includes('blog-setup-notes') || archive.includes('博客搭建'))
ok('related posts hide notes', !article.includes('blog-setup-notes'))
ok('busuanzi https', /busuanzi[^"']*https:\/\/busuanzi|https:\/\/busuanzi/.test(index) || index.includes('https://busuanzi.ibruce.info'))
ok('favicon', fs.existsSync('public/img/favicon.ico'))
ok('hangzhou in distance js', fs.readFileSync('public/js/user-distance.js', 'utf8').includes('杭州'))
ok('distance cache v5', fs.readFileSync('public/js/user-distance.js', 'utf8').includes('user_distance_cache_v5'))
ok('hero-latest no innerHTML assign', !fs.readFileSync('public/js/hero-latest.js', 'utf8').includes('innerHTML ='))
ok('photography has cards', (photography.match(/class="photo-card"/g) || []).length >= 100)
ok('photography uses photography path', photography.includes('/img/photography/'))
ok('photography no placeholder', !photography.includes('<!-- photo-list -->'))
ok('photography no leftover filter', !photography.includes('month-filter'))
ok('photography fancybox', photography.includes('data-fancybox="photography"'))
ok('photography year groups', photography.includes('photo-year'))
ok('home now block', index.includes('class="home-now"'))
ok('planning post hidden', !index.includes('anime-page-plan'))
ok('search quiet placeholder', index.includes('找一篇随笔，或一个名字'))
ok('search title restyle', index.includes('在文字里找'))

const failed = checks.filter(c => !c.pass)
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' passed')
if (failed.length) process.exit(1)
