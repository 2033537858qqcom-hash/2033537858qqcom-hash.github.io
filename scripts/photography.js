'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, 'img')

// Copy all images from D:\MyBolg/img to public/img/photography/ so they are served under /img/
const targetDir = path.join(root, 'public', 'img', 'photography')
fs.mkdirSync(targetDir, { recursive: true })
const imgFiles = fs.readdirSync(sourceDir)
  .filter(file => file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.webp'))
  .sort()
for (const file of imgFiles) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file))
}
console.log(`[photography] synced ${imgFiles.length} images from img/ to public/img/photography`)

function getImageFiles() {
  try {
    const files = fs.readdirSync(sourceDir)
      .filter(file => file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.webp'))
      .sort()
    return files
  } catch (e) {
    console.error('[photography] error reading dir:', e.message)
    return []
  }
}

function getPhotoCard(file) {
  const ext = path.extname(file).toLowerCase()
  let src = `/img/${file}`
  if (ext === '.jpg') {
    const webpName = file.replace('.jpg', '.webp')
    const webpPath = path.join(sourceDir, webpName)
    if (fs.existsSync(webpPath)) {
      src = `/img/${webpName}`
    }
  }
  const alt = file.replace(/\.(jpg|webp)$/, '')
  return `<div class="photo-card">
    <img src="${src}" alt="${alt}" loading="lazy" decoding="async">
  </div>`
}

function renderPhotoGrid(images) {
  return images.map(getPhotoCard).join('\n')
}

try {
  hexo.extend.filter.register('before_post_render', data => {
    console.log('[photography] before_render filter running for', data.source)
    if (data.source !== 'pages/photography.md') return data

    const images = getImageFiles()
    const html = renderPhotoGrid(images)
    
    // Replace placeholder in content
    if (data.content.includes('<!-- photo-list -->')) {
      data.content = data.content.replace('<!-- photo-list -->', html)
    } else if (data.content.includes('更多照片')) {
      // fallback
      data.content = data.content.replace('更多照片可以在这里继续添加', html)
    } else {
      data.content += '\n\n' + html
    }
    return data
  })
} catch (e) {
  console.error('[photography] filter registration failed:', e.message)
}
  console.log('[photography] before_render filter running for', data.source)
  if (data.source !== 'pages/photography.md') return data

  const images = getImageFiles()
  const html = renderPhotoGrid(images)
  
  // Replace placeholder in content
  if (data.content.includes('<!-- photo-list -->')) {
    data.content = data.content.replace('<!-- photo-list -->', html)
  } else if (data.content.includes('更多照片')) {
    // fallback
    data.content = data.content.replace('更多照片可以在这里继续添加', html)
  } else {
    data.content += '\n\n' + html
  }
  return data
})
