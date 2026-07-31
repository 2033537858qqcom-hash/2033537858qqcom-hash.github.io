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
  gap: 24px;
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  counter-reset: photo-count;
}

.photo-card {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
  background: transparent;
  margin-bottom: 24px;
}

.photo-card:hover {
  transform: translateY(-12px) rotate(0.5deg);
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.22);
  z-index: 20;
  filter: brightness(1.02);
}

.photo-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, transparent, rgba(255,255,255,0.4), transparent);
  opacity: 0;
  transition: opacity 0.6s ease;
  pointer-events: none;
}

.photo-card:hover::before {
  opacity: 1;
}

.photo-card img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.photo-card:hover img {
  transform: scale(1.18) rotate(0.8deg);
}

.photo-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.25));
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.photo-card:hover::after {
  opacity: 1;
}

.lightbox {
  max-width: 90vw;
  max-height: 90vh;
}
</style>

<script>
// 高级摄影页：月份筛选 + 搜索 + 精美 hover
document.addEventListener('DOMContentLoaded', () => {
  const filterSelect = document.getElementById('month-filter');
  const searchInput = document.getElementById('search-input');
  const cards = document.querySelectorAll('.photo-card');

  function getCardDate(filename) {
    const match = filename.match(/IMG_\d+_\d+_\d+_(20\d{2}-\d{2}-\d{2})_\d+/);
    return match ? match[1] : '未知';
  }

  // 初始化日期属性
  cards.forEach(card => {
    const img = card.querySelector('img');
    if (img) {
      const date = getCardDate(img.getAttribute('src').split('/').pop());
      card.setAttribute('data-date', date);
      card.dataset.month = date;
    }
  });

  // 高级过滤器
  function filterCards() {
    const selectedMonth = filterSelect.value;
    const searchTerm = searchInput.value.toLowerCase().trim();

    cards.forEach(card => {
      let show = true;

      // 月份筛选
      if (selectedMonth !== 'all' && card.dataset.month !== selectedMonth) {
        show = false;
      }

      // 搜索
      if (searchTerm) {
        const img = card.querySelector('img');
        if (img && !img.alt.toLowerCase().includes(searchTerm)) {
          show = false;
        }
      }

      card.style.display = show ? 'block' : 'none';
    });
  }

  filterSelect.addEventListener('change', filterCards);
  searchInput.addEventListener('input', filterCards);

  // 初始显示所有
  filterCards();

  // 轻箱点击
  const images = document.querySelectorAll('.photo-card img');
  images.forEach(img => {
    img.addEventListener('click', () => {
      console.log('点击查看大图:', img.src);
    });
  });
});
</script>
