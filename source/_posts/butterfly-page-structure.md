---
title: Butterfly 页面结构整理
date: 2026-05-13 22:45:00
updated: 2026-05-13 22:45:00
categories:
  - 技术笔记
tags:
  - Butterfly
  - Hexo
  - Front-matter
cover: /img/optimized/cover-day.webp
top_img: false
description: 梳理 Butterfly 的特殊页面、数据源和当前博客的结构调整思路。
---

Butterfly 的页面并不是只有 Markdown 内容。标签、分类、友链、说说这些页面都有自己的类型和数据来源。

## 页面类型

标签页使用 `type: tags`，分类页使用 `type: categories`，友链页使用 `type: link`。这些类型会触发 Butterfly 内部的页面渲染逻辑。

如果只是写一个普通 Markdown 页面，它能显示，但不会拥有主题提供的特殊结构。

## 数据源

友链数据放在 `source/_data/link.yml`，说说数据放在 `source/_data/shuoshuo.yml`。把数据从页面正文里拆出来，后续维护会更清楚。

## 当前策略

这个博客暂时使用全站固定昼夜背景，所以页面自己的 `top_img` 统一关闭。这样配置更诚实：背景交给全局视觉系统，页面内容交给 Butterfly 的页面机制。
