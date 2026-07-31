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
    <!-- photo-list -->
    <!-- 更多照片可以在这里继续添加 -->
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
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.photo-card:hover {
  transform: scale(1.03);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

.photo-card img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.4s ease;
}

.photo-card:hover img {
  transform: scale(1.08);
}

.photo-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.3));
  opacity: 0;
  transition: opacity 0.3s ease;
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
  // 简单轻箱支持（使用 fancybox 已配置）
  document.addEventListener('DOMContentLoaded', () => {
    const images = document.querySelectorAll('.photo-card img');
    images.forEach(img => {
      img.addEventListener('click', () => {
        // 这里可以扩展 fancybox 调用
        console.log('点击查看大图', img.src);
      });
    });
  });
</script>
