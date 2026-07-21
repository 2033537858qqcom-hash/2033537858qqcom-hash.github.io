/**
 * 访客与站长距离计算与文艺提示卡片 (User Distance Widget)
 * Author: Antigravity AI
 */
(function () {
  // 站长坐标 (默认设置为上海：31.2304, 121.4737)
  const HOST_LAT = 31.2304;
  const HOST_LNG = 121.4737;

  /**
   * 半正矢公式 (Haversine Formula) 计算大圆距离 (km)
   */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半径 km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  /**
   * 生成文艺风诗意文案
   */
  function getLiteraryMessage(distance, city) {
    const locationText = city ? `来自 <strong class="distance-highlight">${city}</strong> 的朋友，` : '亲爱的朋友，';

    if (distance < 50) {
      return `${locationText}我们身处同一座城市。相距仅 <strong class="distance-highlight">${distance}</strong> 公里，好巧，能在代码与文字中相遇。`;
    } else if (distance < 600) {
      return `${locationText}跨越了 <strong class="distance-highlight">${distance}</strong> 公里的风与云，很高兴你能停下脚步，与我同赏这片风景。`;
    } else if (distance < 2000) {
      return `${locationText}你与我相隔 <strong class="distance-highlight">${distance}</strong> 公里。跨越山海与山川，文字总能触及彼此的心灵。`;
    } else {
      return `${locationText}纵使我们相距 <strong class="distance-highlight">${distance}</strong> 公里，但仰望的依然是同一片星空。`;
    }
  }

  /**
   * 渲染距离卡片到侧边栏或指定容器
   */
  function renderDistanceWidget(distance, city) {
    const asideContent = document.getElementById('aside-content');
    if (!asideContent) return;

    // 防止重复渲染
    let widget = document.getElementById('card-user-distance');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'card-user-distance';
      widget.className = 'card-widget card-distance';
      
      // 插入到作者名片下方或最上方
      const cardAuthor = asideContent.querySelector('.card-info');
      if (cardAuthor && cardAuthor.nextSibling) {
        asideContent.insertBefore(widget, cardAuthor.nextSibling);
      } else {
        asideContent.appendChild(widget);
      }
    }

    const message = getLiteraryMessage(distance, city);
    widget.innerHTML = `
      <div class="item-headline">
        <i class="fas fa-compass fa-spin-hover"></i>
        <span>山海距离</span>
      </div>
      <div class="distance-content">
        <p class="distance-text">${message}</p>
        <div class="distance-footer">
          <span class="distance-tag"><i class="fas fa-paper-plane"></i> 维度同频中</span>
        </div>
      </div>
    `;
  }

  /**
   * 获取访客 IP 与位置信息
   */
  function initUserDistance() {
    // 检查缓存，避免频繁请求 API
    const cachedData = localStorage.getItem('user_distance_cache');
    if (cachedData) {
      try {
        const { distance, city, timestamp } = JSON.parse(cachedData);
        // 缓存 24 小时
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          renderDistanceWidget(distance, city);
          return;
        }
      } catch (e) {}
    }

    // 调用免费地理位置 API
    fetch('https://ipapi.co/json/')
      ? fetch('https://ipapi.co/json/')
          .then((res) => res.json())
          .then((data) => {
            if (data && data.latitude && data.longitude) {
              const distance = calculateDistance(
                HOST_LAT,
                HOST_LNG,
                data.latitude,
                data.longitude
              );
              const city = data.city || data.region || '';
              
              localStorage.setItem(
                'user_distance_cache',
                JSON.stringify({ distance, city, timestamp: Date.now() })
              );
              renderDistanceWidget(distance, city);
            } else {
              throw new Error('Invalid IP data');
            }
          })
          .catch(() => {
            // 备用兜底逻辑：尝试国内免费 IP API
            fetch('https://api.vvhan.com/api/ipInfo')
              .then((res) => res.json())
              .then((data) => {
                const city = (data.info && data.info.city) || '远方';
                // 给出一个诗意的估计距离
                const distance = 820; 
                renderDistanceWidget(distance, city);
              })
              .catch(() => {
                // 默认文艺提示
                renderDistanceWidget(1200, '远方');
              });
          })
      : renderDistanceWidget(1200, '远方');
  }

  // 初始化并在 PJAX 页面切换后重新执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserDistance);
  } else {
    initUserDistance();
  }

  document.addEventListener('pjax:complete', initUserDistance);
})();
