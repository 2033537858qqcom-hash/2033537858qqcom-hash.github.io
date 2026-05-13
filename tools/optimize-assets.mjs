import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const outDir = 'source/img/optimized'
await mkdir(outDir, { recursive: true })

const jobs = [
  {
    input: '白天.png',
    output: `${outDir}/banner-day-bg.webp`,
    resize: { width: 1600, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: '夜晚.png',
    output: `${outDir}/banner-night-bg.webp`,
    resize: { width: 1600, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: '白天.png',
    output: `${outDir}/cover-day.webp`,
    resize: { width: 900, withoutEnlargement: true },
    webp: { quality: 70, effort: 6 }
  },
  {
    input: '夜晚.png',
    output: `${outDir}/cover-night.webp`,
    resize: { width: 900, withoutEnlargement: true },
    webp: { quality: 70, effort: 6 }
  },
  {
    input: '白天.png',
    output: `${outDir}/music-day.webp`,
    resize: { width: 420, height: 420, fit: 'cover' },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: '夜晚.png',
    output: `${outDir}/music-night.webp`,
    resize: { width: 420, height: 420, fit: 'cover' },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'source/img/avatar.jpg',
    output: `${outDir}/music-avatar.webp`,
    resize: { width: 420, height: 420, fit: 'cover' },
    webp: { quality: 76, effort: 6 }
  }
]

for (const job of jobs) {
  await sharp(job.input)
    .resize(job.resize)
    .webp(job.webp)
    .toFile(job.output)
  console.log(`${job.output}`)
}
