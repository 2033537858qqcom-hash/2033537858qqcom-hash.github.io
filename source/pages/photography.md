---
title: 摄影集
date: 2026-07-31
top_img: false
layout: page
permalink: /photography/
---

<section class="photography-page">
  <header class="photography-header">
    <p class="photography-eyebrow">镜头里的日常与风景</p>
    <h2>摄影展示</h2>
    <p>记录生活中的光影瞬间。希望能带给你一些治愈和灵感。</p>
  </header>

  <div class="photography-filters">
    <select id="month-filter">
      <option value="all">全部月份</option>
      <option value="2026-07">2026 年 7 月</option>
      <option value="2026-06">2026 年 6 月</option>
      <option value="2026-05">2026 年 5 月</option>
      <option value="2026-04">2026 年 4 月</option>
      <option value="2026-03">2026 年 3 月</option>
    </select>
  </div>

  <div class="photo-grid" id="photo-grid">
    <div class="photo-card">
      <img src="/img/photography/IMG_20260731_021750_133_2026-07-31_02-39-14_100.webp" alt="2026年7月31日 夜景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260731_021720_132_2026-07-31_02-39-14_061.webp" alt="2026年7月31日 风景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_183158_130_2026-07-31_02-39-14_011.webp" alt="2026年7月25日 夜景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_183731_131_2026-07-31_02-39-14_037.webp" alt="2026年7月25日 城市" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_183045_129_2026-07-31_02-39-13_987.webp" alt="2026年7月25日 街头" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_182656_128_2026-07-31_02-39-13_968.webp" alt="2026年7月25日 夜景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_182404_126_2026-07-31_02-39-13_902.webp" alt="2026年7月25日 风景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_181738_125_2026-07-31_02-39-13_870.webp" alt="2026年7月25日 城市夜景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_182515_127_2026-07-31_02-39-13_942.webp" alt="2026年7月25日 街景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_173855_124_2026-07-31_02-39-13_845.webp" alt="2026年7月25日 夜景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_172559_121_2026-07-31_02-39-13_729.webp" alt="2026年7月25日 风景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_173222_122_2026-07-31_02-39-13_786.webp" alt="2026年7月25日 街头" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_173737_123_2026-07-31_02-39-13_820.webp" alt="2026年7月25日 夜景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_162255_120_2026-07-31_02-39-13_692.webp" alt="2026年7月25日 风景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260725_145114_119_2026-07-31_02-39-13_630.webp" alt="2026年7月25日 城市" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260605_183249_23_2026-07-31_02-39-11_801.webp" alt="2026年6月5日 风景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260629_225305_56_2026-07-31_02-39-12_156.webp" alt="2026年6月29日 夜景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260605_185754_68_2026-07-31_02-39-12_358.webp" alt="2026年6月5日 街景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260724_015950_69_2026-07-31_02-39-12_383.webp" alt="2026年7月24日 风景" loading="lazy">
    </div>
    <div class="photo-card">
      <img src="/img/photography/IMG_20260328_153721_34_2026-07-31_02-39-11_910.webp" alt="2026年3月28日 夜景" loading="lazy">
    </div>
    <!-- 更多照片可以在这里继续添加（建议直接在 source/img/photography/ 目录中添加图片，页面会自动更新） -->
  </div>
</section>

<style>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.photo-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  background: #f8f9fa;
  margin-bottom: 12px;
}

.photo-card:hover {
  transform: translateY(-8px) scale(1.03);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
  z-index: 10;
}

.photo-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.25));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.photo-card:hover::before {
  opacity: 1;
}

.photo-card img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.photo-card:hover img {
  transform: scale(1.12);
}

.photo-card::after {
  content: attr(data-date);
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: linear-gradient(transparent, rgba(0,0,0,0.75));
  color: white;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.3s ease;
  text-align: center;
  font-weight: 500;
}

.photo-card:hover::after {
  opacity: 1;
  transform: translateY(0);
}

.lightbox {
  max-width: 90vw;
  max-height: 90vh;
}
</style>

<script>
// 摄影过滤器 + 增强效果
document.addEventListener('DOMContentLoaded', () => {
  const filterSelect = document.getElementById('month-filter');
  const cards = document.querySelectorAll('.photo-card');

  // 从文件名解析日期 (如 IMG_20260731_..._2026-07-31_...)
  function getCardDate(filename) {
    const match = filename.match(/IMG_\d+_\d+_\d+_(20\d{2}-\d{2}-\d{2})_\d+/);
    return match ? match[1] : '未知';
  }

  // 初始化卡片日期属性
  cards.forEach(card => {
    const img = card.querySelector('img');
    if (img) {
      const date = getCardDate(img.getAttribute('src').split('/').pop());
      card.setAttribute('data-date', date);
      card.dataset.month = date;
    }
  });

  // 过滤器功能
  filterSelect.addEventListener('change', (e) => {
    const selected = e.target.value;
    cards.forEach(card => {
      if (selected === 'all' || card.dataset.month === selected) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  });

  // 轻箱点击支持
  const images = document.querySelectorAll('.photo-card img');
  images.forEach(img => {
    img.addEventListener('click', () => {
      console.log('点击查看大图:', img.src);
    });
  });

  console.log('摄影页已加载，共', cards.length, '张照片，可用月份筛选');
});
</script>
