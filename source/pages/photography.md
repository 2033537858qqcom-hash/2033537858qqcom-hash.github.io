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
}

.photo-grid__empty {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--lijiahao-muted, #66738a);
  text-align: center;
}

.photo-card {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  transition: transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s cubic-bezier(0.23, 1, 0.32, 1);
  background: transparent;
}

.photo-card:hover {
  transform: translateY(-12px) rotate(0.5deg);
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.22);
  z-index: 20;
  filter: brightness(1.02);
}

.photo-card a {
  display: block;
}

.photo-card img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.photo-card:hover img {
  transform: scale(1.08);
}
</style>
