import fs from 'fs'

const index = fs.readFileSync('public/index.html', 'utf8')
const atom = fs.readFileSync('public/atom.xml', 'utf8')
const search = fs.readFileSync('public/search.xml', 'utf8')
const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8')
const archive = fs.readFileSync('public/archives/index.html', 'utf8')

const checks = []
const ok = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail })
  console.log((pass ? 'OK  ' : 'FAIL') + ' ' + name + (detail ? ' �?' + detail : ''))
}

ok('asset css v1.5.7', index.includes('custom.css?v=1.5.7'))
ok('asset cursor v1.5.7', index.includes('cursor-enhance.js?v=1.5.7'))
ok('click-values injected', index.includes('click-values.js'))
ok('no hidden on home', !index.includes('blog-setup-notes') && !index.includes('butterfly-page-structure'))
ok('no hidden in atom', !atom.includes('blog-setup-notes'))
ok('no hidden in search', !search.includes('blog-setup-notes'))
ok('no hidden in sitemap', !sitemap.includes('blog-setup-notes'))
ok('archive still has hidden (series access)', archive.includes('blog-setup-notes') || archive.includes('博客搭建'))
ok('busuanzi https', /busuanzi[^"']*https:\/\/busuanzi|https:\/\/busuanzi/.test(index) || index.includes('https://busuanzi.ibruce.info'))
ok('favicon', fs.existsSync('public/img/favicon.ico'))
ok('hangzhou in distance js', fs.readFileSync('public/js/user-distance.js', 'utf8').includes('杭州'))
ok('distance cache v5', fs.readFileSync('public/js/user-distance.js', 'utf8').includes('user_distance_cache_v5'))
ok('hero-latest no innerHTML assign', !fs.readFileSync('public/js/hero-latest.js', 'utf8').includes("innerHTML ="))

const failed = checks.filter(c => !c.pass)
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' passed')
if (failed.length) process.exit(1)
