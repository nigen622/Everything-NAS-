/* ==========================================================================
  Everything HTTP Server - NAS 前端增强 (nas.js)
  - 视图切换：列表 / 卡片 —— 所有文件类型（文件夹/图片/视频/普通文件）均支持卡片模式
  - 列表模式：保持服务器原生列表，不注入预览图
  - 卡片模式：图片缩略图（懒加载）→ 点击灯箱看大图（键盘/触屏切换）；视频海报 → 在线播放（HTML5 Range 流式，倍速/全屏）
  - 全部资源本地化，无外部依赖；IIFE 封装，不污染全局
  ========================================================================== */
(function () {
  'use strict';

  /* ---------- 媒体类型识别 ---------- */
  var IMG_EXT = {
    jpg: 1, jpeg: 1, png: 1, gif: 1, webp: 1, bmp: 1, svg: 1, ico: 1, avif: 1, heic: 1, heif: 1, jfif: 1, tif: 1, tiff: 1
  };
  // 浏览器原生可播放（含 H.264 / VP9 / AV1）
  var VID_PLAY_EXT = {
    mp4: 1, m4v: 1, webm: 1, mov: 1, mpg: 1, mpeg: 1, ogv: 1, avi: 1, '3gp': 1, '3g2': 1
  };
  // 可识别但多数浏览器不能直接播放 → 提示 + 下载兜底
  var VID_DL_EXT = {
    mkv: 1, ts: 1, m2ts: 1, wmv: 1, flv: 1, rmvb: 1, rm: 1, vob: 1, asf: 1, 'f4v': 1, mts: 1, divx: 1, xvid: 1
  };

  function getExt(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }
  function getType(name) {
    var e = getExt(name);
    if (IMG_EXT[e]) return 'image';
    if (VID_PLAY_EXT[e]) return 'video';
    if (VID_DL_EXT[e]) return 'video-dl';
    return 'other';
  }

  /* ---------- 状态 ---------- */
  var images = [];    // 当前页图片：{ url, name }
  var videos = [];    // 当前页视频：{ url, name, size, playable }
  var files = [];     // 当前页全部条目：{ url, name, size, type }（type: dir/image/video/video-dl/other）
  var curImg = -1;
  var cardView = false;   // 视图模式：false=列表 / true=卡片
  var lbStartX = 0, lbStartY = 0, lbDragging = false;
  var VIEW_KEY = 'nas.view';   // localStorage 键：记住列表/卡片偏好，刷新后不变

  /* ---------- 懒加载 ---------- */
  var io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            var el = en.target;
            if (el.dataset.src) {
              el.src = el.dataset.src;
              delete el.dataset.src;
            }
            el.classList.add('loaded');
            io.unobserve(el);
          }
        });
      }, { rootMargin: '120px' })
    : null;

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function findImageIndex(url) {
    for (var i = 0; i < images.length; i++) {
      if (images[i].url === url) return i;
    }
    return -1;
  }

  /* ---------- DOM 容器（单例） ---------- */
  var lb, lbImg, lbName, lbCounter, player, pVideo;

  function buildUI() {
    /* 兼容重复注入场景：复用已存在的容器 */
    lb = document.getElementById('nas-lightbox');
    player = document.getElementById('nas-player');
    wall = document.getElementById('nas-wall');
    if (lb && player && wall) {
      lbImg = lb.querySelector('img');
      lbName = lb.querySelector('.nas-lb-name');
      lbCounter = lb.querySelector('.nas-lb-counter');
      pVideo = player.querySelector('video');
      /* 旧版播放器结构（无影院控制条）→ 重建，避免新逻辑绑定失败 */
      if (!player.querySelector('.nas-p-play')) {
        player.parentNode.removeChild(player);
        player = null;
        pVideo = null;
      } else {
        return;
      }
    }

    /* 灯箱 */
    lb = document.createElement('div');
    lb.className = 'nas-lightbox';
    lb.id = 'nas-lightbox';
    lb.innerHTML =
      '<button class="nas-lb-btn nas-lb-prev" title="上一张 (←)">‹</button>' +
      '<button class="nas-lb-btn nas-lb-next" title="下一张 (→)">›</button>' +
      '<button class="nas-lb-close" title="关闭 (Esc)">✕</button>' +
      '<img alt="" />' +
      '<div class="nas-lb-name"></div>' +
      '<div class="nas-lb-counter"></div>';
    document.body.appendChild(lb);
    lbImg = lb.querySelector('img');
    lbName = lb.querySelector('.nas-lb-name');
    lbCounter = lb.querySelector('.nas-lb-counter');

    /* 播放器（影院模式：自定义控制条 + 全屏黑场） */
    player = document.createElement('div');
    player.className = 'nas-player';
    player.id = 'nas-player';
    player.innerHTML =
      '<div class="nas-player-stage">' +
        '<div class="nas-p-top">' +
          '<span class="nas-p-name"></span>' +
          '<button class="nas-p-close" title="关闭 (Esc)">✕</button>' +
        '</div>' +
        '<video playsinline></video>' +
        '<div class="nas-p-bigplay">▶</div>' +
        '<div class="nas-p-controls">' +
          '<div class="nas-p-progress">' +
            '<div class="nas-p-buffer"></div>' +
            '<div class="nas-p-played"></div>' +
            '<div class="nas-p-seek"></div>' +
          '</div>' +
          '<div class="nas-p-btns">' +
            '<button class="nas-p-play" title="播放/暂停 (空格)">▶</button>' +
            '<span class="nas-p-time">0:00 / 0:00</span>' +
            '<span class="nas-p-grow"></span>' +
            '<button class="nas-p-rate" title="倍速">1.0x</button>' +
            '<button class="nas-p-vol" title="静音 (M)">🔊</button>' +
            '<a class="nas-p-dl" title="下载" target="_blank" rel="noopener">⤓</a>' +
            '<button class="nas-p-fs" title="全屏 (F)">⛶</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(player);
    pVideo = player.querySelector('video');

    /* 卡片视图容器（追加在表格之后） */
    var wall = document.createElement('div');
    wall.className = 'nas-wall';
    wall.id = 'nas-wall';
    document.body.appendChild(wall);
  }

  /* ---------- 灯箱 ---------- */
  function openLightbox(i) {
    if (!images.length) return;
    i = (i + images.length) % images.length;
    curImg = i;
    lbImg.style.opacity = '0';
    lbImg.src = images[i].url;
    lbImg.onload = function () { lbImg.style.opacity = '1'; };
    lbName.textContent = images[i].name;
    lbCounter.textContent = (i + 1) + ' / ' + images.length;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    curImg = -1;
  }

  /* ---------- 播放器（影院模式） ---------- */
  var RATES = [0.5, 1, 1.25, 1.5, 2];
  var rateIdx = 1;
  var vidErrH = null, vidMetaH = null;   // 解码检测监听器引用（单例 video，需先移除再绑定）
  var hideBarT = null;                   // 控制条自动隐藏计时器
  var barDragging = false;               // 进度条拖动状态

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + pad2(m) : m) + ':' + pad2(sec);
  }

  /* 全屏 API 兼容封装 */
  function fsRequest(el) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    return null;
  }
  function fsExit() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  /* 控制条显示/自动隐藏 */
  function showBar() {
    if (!player) return;
    player.classList.add('bar-show');
    clearTimeout(hideBarT);
    if (pVideo && !pVideo.paused) {
      hideBarT = setTimeout(function () { player.classList.remove('bar-show'); }, 3000);
    }
  }

  function setPlayState() {
    if (!pVideo) return;
    player.querySelector('.nas-p-play').textContent = pVideo.paused ? '▶' : '❚❚';
    player.classList.toggle('playing', !pVideo.paused);
    player.querySelector('.nas-p-bigplay').textContent = pVideo.paused ? '▶' : '';
  }

  function togglePlay() {
    if (!pVideo || !pVideo.src) return;
    if (pVideo.paused) {
      var p = pVideo.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      pVideo.pause();
      showBar();
    }
  }

  function seekBy(sec) {
    if (!pVideo || !isFinite(pVideo.duration)) return;
    pVideo.currentTime = Math.max(0, Math.min(pVideo.duration, pVideo.currentTime + sec));
    showBar();
  }

  function toggleMute() {
    if (!pVideo) return;
    pVideo.muted = !pVideo.muted;
    setVolIcon();
    showBar();
  }
  function changeVol(d) {
    if (!pVideo) return;
    var v = pVideo.muted ? 1 : pVideo.volume;
    v = Math.max(0, Math.min(1, v + d));
    pVideo.volume = v;
    pVideo.muted = false;
    setVolIcon();
    showBar();
  }
  function setVolIcon() {
    if (!pVideo) return;
    player.querySelector('.nas-p-vol').textContent =
      (pVideo.muted || pVideo.volume === 0) ? '🔇' : '🔊';
  }

  function toggleFullscreen() {
    var v = pVideo;
    if (fsEl()) { fsExit(); return; }
    /* iOS Safari：仅 video 支持原生全屏 */
    if (v && v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return; }
    var p = fsRequest(player);
    if (p && p.catch) p.catch(function () { fsRequest(v); });  // 容器全屏失败退到 video
  }

  /* 切换到「编码不支持 + 下载」提示界面 */
  function showUnplayableMsg(url) {
    var stage = player.querySelector('.nas-player-stage');
    var vid = pVideo;
    var old = player.querySelector('.nas-player-msg');
    if (old) old.remove();
    if (stage) stage.style.display = 'none';
    if (vidErrH) { vid.removeEventListener('error', vidErrH); vidErrH = null; }
    if (vidMetaH) { vid.removeEventListener('loadedmetadata', vidMetaH); vidMetaH = null; }
    vid.removeAttribute('src');
    var m = document.createElement('div');
    m.className = 'nas-player-msg';
    m.innerHTML =
      '<button class="nas-pm-close" title="关闭 (Esc)">✕</button>' +
      '<div class="nas-pm-title">此视频编码浏览器无法解码</div>' +
      '<p>可能是 H.265/HEVC、HDR、10bit 或超高码率视频。请下载后用本地播放器（如 PotPlayer / VLC）观看。</p>' +
      '<p style="margin-top:14px"><a href="' + esc(url) + '" target="_blank" rel="noopener">↓ 点击下载文件</a></p>';
    /* 右上角关闭按钮 / 点击提示区空白处（非链接）均可返回 */
    var closeBtn = m.querySelector('.nas-pm-close');
    if (closeBtn) closeBtn.addEventListener('click', closePlayer);
    m.addEventListener('click', function (e) {
      if (e.target === m) closePlayer();
    });
    player.appendChild(m);
    player.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function bindPlayerEvents() {
    var stage = player.querySelector('.nas-player-stage');
    var progress = player.querySelector('.nas-p-progress');
    var played = player.querySelector('.nas-p-played');
    var buffer = player.querySelector('.nas-p-buffer');

    function seekToClientX(x) {
      if (!pVideo || !isFinite(pVideo.duration)) return;
      var r = progress.getBoundingClientRect();
      var ratio = (x - r.left) / r.width;
      if (ratio < 0) ratio = 0; else if (ratio > 1) ratio = 1;
      pVideo.currentTime = ratio * pVideo.duration;
      played.style.width = (ratio * 100) + '%';
      showBar();
    }

    /* 顶部关闭 */
    player.querySelector('.nas-p-close').addEventListener('click', closePlayer);

    /* 画面点击 → 播放/暂停（控制条按钮不触发） */
    pVideo.addEventListener('click', function () {
      if (player.classList.contains('open')) togglePlay();
    });
    pVideo.addEventListener('dblclick', function () { toggleFullscreen(); });

    /* 大播放按钮 */
    player.querySelector('.nas-p-bigplay').addEventListener('click', function () {
      if (player.classList.contains('open')) togglePlay();
    });

    /* 控制条按钮 */
    player.querySelector('.nas-p-play').addEventListener('click', function () { togglePlay(); });
    player.querySelector('.nas-p-rate').addEventListener('click', function () {
      rateIdx = (rateIdx + 1) % RATES.length;
      pVideo.playbackRate = RATES[rateIdx];
      this.textContent = RATES[rateIdx].toFixed(1) + 'x';
      showBar();
    });
    player.querySelector('.nas-p-vol').addEventListener('click', toggleMute);
    player.querySelector('.nas-p-fs').addEventListener('click', toggleFullscreen);

    /* 进度条（pointer 事件兼容触屏） */
    progress.addEventListener('pointerdown', function (e) {
      barDragging = true;
      progress.setPointerCapture(e.pointerId);
      seekToClientX(e.clientX);
    });
    progress.addEventListener('pointermove', function (e) {
      if (barDragging) seekToClientX(e.clientX);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      progress.addEventListener(ev, function () { barDragging = false; });
    });

    /* 播放状态与时间 */
    pVideo.addEventListener('play', function () { setPlayState(); showBar(); });
    pVideo.addEventListener('pause', function () { setPlayState(); showBar(); });
    pVideo.addEventListener('ended', function () { setPlayState(); showBar(); });
    pVideo.addEventListener('timeupdate', function () {
      var t = pVideo.currentTime, d = pVideo.duration || 0;
      player.querySelector('.nas-p-time').textContent = fmtTime(t) + ' / ' + fmtTime(d);
      if (!barDragging) played.style.width = (d ? (t / d * 100) : 0) + '%';
    });
    pVideo.addEventListener('progress', function () {
      var d = pVideo.duration || 0, b = 0;
      if (d && pVideo.buffered.length) {
        b = pVideo.buffered.end(pVideo.buffered.length - 1) / d * 100;
      }
      buffer.style.width = b + '%';
    });
    pVideo.addEventListener('volumechange', setVolIcon);

    /* 鼠标/触摸 → 唤醒控制条并自动隐藏 */
    stage.addEventListener('mousemove', showBar);
    stage.addEventListener('touchstart', showBar);

    /* 全屏状态同步按钮 */
    document.addEventListener('fullscreenchange', function () {
      var isFs = !!fsEl();
      player.querySelector('.nas-p-fs').textContent = isFs ? '⤢' : '⛶';
      if (isFs) showBar();
    });
    document.addEventListener('webkitfullscreenchange', function () {
      var isFs = !!fsEl();
      player.querySelector('.nas-p-fs').textContent = isFs ? '⤢' : '⛶';
      if (isFs) showBar();
    });
  }

  function openPlayer(url, name, playable) {
    var stage = player.querySelector('.nas-player-stage');
    var dl = player.querySelector('.nas-p-dl');
    var vid = pVideo;
    player.querySelector('.nas-p-name').textContent = name;
    dl.setAttribute('href', url);

    if (!playable) { showUnplayableMsg(url); return; }

    stage.style.display = '';
    var msg = player.querySelector('.nas-player-msg');
    if (msg) msg.remove();

    /* 解码失败兜底：黑屏/无法播放时自动切换下载提示 */
    var guard = function () {
      if (!player.classList.contains('open')) return;   // 播放器已关闭则忽略
      showUnplayableMsg(url);
    };
    if (vidErrH) vid.removeEventListener('error', vidErrH);
    vidErrH = guard;
    vid.addEventListener('error', guard);
    if (vidMetaH) vid.removeEventListener('loadedmetadata', vidMetaH);
    vidMetaH = function () {
      if (!vid.videoWidth || !vid.videoHeight) guard();   // 元数据解析不出视频轨 → 仅音频可解
    };
    vid.addEventListener('loadedmetadata', vidMetaH);

    vid.src = url;
    rateIdx = 1;
    player.querySelector('.nas-p-rate').textContent = '1.0x';
    vid.playbackRate = 1;
    player.querySelector('.nas-p-time').textContent = '0:00 / 0:00';
    player.querySelector('.nas-p-played').style.width = '0%';
    player.querySelector('.nas-p-buffer').style.width = '0%';
    setVolIcon();
    player.classList.add('open', 'bar-show');
    document.body.style.overflow = 'hidden';
    var p = vid.play();
    if (p && p.catch) p.catch(function () {});
  }

  function closePlayer() {
    player.classList.remove('open', 'bar-show');
    clearTimeout(hideBarT);
    if (fsEl()) fsExit();
    var stage = player.querySelector('.nas-player-stage');
    if (stage) stage.style.display = '';
    var msg = player.querySelector('.nas-player-msg');
    if (msg) msg.remove();
    if (pVideo) {
      pVideo.pause();
      if (vidErrH) { pVideo.removeEventListener('error', vidErrH); vidErrH = null; }
      if (vidMetaH) { pVideo.removeEventListener('loadedmetadata', vidMetaH); vidMetaH = null; }
      pVideo.removeAttribute('src');
      pVideo.load();
    }
    document.body.style.overflow = '';
  }

  /* ---------- 卡片视图 ---------- */
  var wall = null;

  /* 生成卡片媒体区 HTML（按类型渲染缩略图/海报/图标） */
  function cardMediaHTML(f) {
    var u = esc(f.url);
    if (f.type === 'dir-up') {
      return '<div class="nas-wc-media nas-wc-icon"><span class="nas-wc-icon-up">↩</span></div>';
    }
    if (f.type === 'dir') {
      return '<div class="nas-wc-media nas-wc-icon"><span class="nas-wc-icon-folder"></span></div>';
    }
    if (f.type === 'image') {
      return '<div class="nas-wc-media"><img class="nas-wc-img" alt="' + esc(f.name) + '" loading="lazy" decoding="async" data-src="' + u + '"></div>';
    }
    if (f.type === 'video') {
      return '<div class="nas-wc-media"><video preload="metadata" muted playsinline src="' + u + '#t=0.1"></video><div class="nas-wc-play"></div></div>';
    }
    if (f.type === 'video-dl') {
      return '<div class="nas-wc-media"><span class="nas-wc-badge">格式不支持</span></div>';
    }
    return '<div class="nas-wc-media nas-wc-icon"><span class="nas-wc-doc"></span><span class="nas-wc-ext">' + esc((getExt(f.name) || 'FILE').toUpperCase()) + '</span></div>';
  }

  function buildCards() {
    var existed = document.getElementById('nas-wall');
    wall = existed || document.createElement('div');
    wall.className = 'nas-wall';
    wall.id = 'nas-wall';
    if (!existed) document.body.appendChild(wall);

    var ups = 0, dirs = 0, imgs = 0, vids = 0;
    files.forEach(function (f) {
      if (f.type === 'dir-up') ups++;
      else if (f.type === 'dir') dirs++;
      else if (f.type === 'image') imgs++;
      else if (f.type === 'video' || f.type === 'video-dl') vids++;
    });

    var html = '<div class="nas-wall-head"><h2>卡片视图</h2>' +
      '<span>' + (files.length - ups) + ' 个项目 · ' + dirs + ' 文件夹 · ' + imgs + ' 图片 · ' + vids + ' 视频</span></div>';

    if (files.length) {
      html += '<div class="nas-wall-grid">';
      files.forEach(function (f, i) {
        var n = esc(f.name), s = esc(f.size || '');
        var action = f.type === 'dir-up' ? '返回上级' : (f.type === 'dir' ? '打开' : (f.type === 'image' ? '预览' : (f.type === 'video' ? '▶ 在线播放' : '查看')));
        html +=
          '<div class="nas-wall-card nas-card-' + f.type + '" data-i="' + i + '">' +
            cardMediaHTML(f) +
            '<div class="nas-wc-info">' +
              '<div class="nas-wc-name" title="' + n + '">' + n + '</div>' +
              '<div class="nas-wc-meta"><span>' + s + '</span><span class="nas-wc-action">' + action + '</span></div>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="nas-wall-empty">当前结果中没有可展示的项目</div>';
    }
    wall.innerHTML = html;

    /* 卡片图片缩略图懒加载 */
    var cardImgs = wall.querySelectorAll('.nas-wc-img');
    for (var j = 0; j < cardImgs.length; j++) {
      var img = cardImgs[j];
      if (io) io.observe(img);
      else if (img.dataset.src) { img.src = img.dataset.src; }
    }
  }

  function toggleView() {
    var table = document.querySelector('table');
    var btnList = document.getElementById('nas-btn-list');
    var btnCard = document.getElementById('nas-btn-wall');
    cardView = !cardView;
    if (cardView) {
      buildCards();
      wall.classList.add('open');
      if (table) table.style.display = 'none';
      if (btnList) btnList.classList.remove('active');
      if (btnCard) btnCard.classList.add('active');
    } else {
      wall.classList.remove('open');
      if (table) table.style.display = '';
      if (btnList) btnList.classList.add('active');
      if (btnCard) btnCard.classList.remove('active');
    }
    /* 记住视图偏好：刷新/翻页/搜索后保持 */
    try { localStorage.setItem(VIEW_KEY, cardView ? 'card' : 'list'); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* 恢复上次保存的视图偏好（必须在 enhanceRows 之后调用，确保 files/按钮就绪） */
  function restoreView() {
    var saved = null;
    try { saved = localStorage.getItem(VIEW_KEY); } catch (e) {}
    if (saved === 'card' && files.length && !cardView) toggleView();
  }

  /* ---------- 行增强 ---------- */
  function enhanceRows() {
    var rows = document.querySelectorAll('tr.trdata1, tr.trdata2');

    images = [];
    videos = [];
    files = [];

    /* 上级目录行（服务器模板为普通 <tr><td class="updir">，不在 trdata1/2 之列，需单独查询） */
    var upEntry = null;
    var upTd = document.querySelector('tr td.updir');
    if (upTd) {
      var upA = upTd.querySelector('a');
      if (upA) upEntry = { url: upA.href, name: '返回上一级', size: '', type: 'dir-up' };
    }

    if (!rows.length && !upEntry) return;

    rows.forEach(function (row) {
      var td = row.querySelector('td:first-child');
      if (!td) return;
      var a = td.querySelector('a');
      if (!a) return;
      /* 兼容重复注入：已增强过的行跳过 */
      if (td.querySelector('.nas-file-cell')) return;

      var icon = td.querySelector('img.icon');
      var isDir = icon && /folder/i.test(icon.getAttribute('src') || '');
      var url = a.href;
      var name = (a.textContent || '').trim();
      var sizeEl = row.querySelector('td.sizedata');
      var size = sizeEl ? sizeEl.textContent.trim() : '';

      /* 文件夹：仅进入卡片视图 */
      if (isDir) {
        files.push({ url: url, name: name, size: '', type: 'dir' });
        return;
      }

      var type = getType(name);
      files.push({ url: url, name: name, size: size, type: type });
      if (type === 'other') return;

      if (type === 'image') {
        images.push({ url: url, name: name });
        /* 列表模式不注入预览图（保持干净的原生列表），缩略图仅卡片模式展示 */
      } else {
        /* 视频：列表模式同样不注入海报，仅记录供卡片模式使用 */
        videos.push({ url: url, name: name, size: size, playable: type === 'video' });
      }
    });

    /* 「返回上级」入口置顶（卡片网格首位） */
    if (upEntry) files.unshift(upEntry);

    /* 有结果就注入「列表 / 卡片」切换按钮 */
    if (files.length) ensureToggle();
  }

  function ensureToggle() {
    if (document.getElementById('nas-btn-wall')) return;
    var form = document.getElementById('searchform');
    if (!form) return;
    var bar = document.createElement('div');
    bar.className = 'nas-view-toggle';
    bar.innerHTML =
      '<button id="nas-btn-list" class="active"><span class="nas-ic-list"></span>列表</button>' +
      '<button id="nas-btn-wall"><span class="nas-ic-wall"></span>卡片</button>';
    form.parentNode.insertBefore(bar, form.nextSibling);

    document.getElementById('nas-btn-list').addEventListener('click', function () {
      if (cardView) toggleView();
    });
    document.getElementById('nas-btn-wall').addEventListener('click', function () {
      if (!cardView) toggleView();
    });
  }

  /* ---------- 全局事件委托 ---------- */
  function bindEvents() {
    /* 灯箱 */
    lb.querySelector('.nas-lb-close').addEventListener('click', closeLightbox);
    lb.querySelector('.nas-lb-prev').addEventListener('click', function () { openLightbox(curImg - 1); });
    lb.querySelector('.nas-lb-next').addEventListener('click', function () { openLightbox(curImg + 1); });
    lb.addEventListener('click', function (e) {
      if (e.target === lb) closeLightbox();
    });

    /* 触屏滑动切换 */
    lb.addEventListener('touchstart', function (e) {
      lbStartX = e.touches[0].clientX;
      lbStartY = e.touches[0].clientY;
      lbDragging = true;
    }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (!lbDragging) return;
      lbDragging = false;
      var dx = e.changedTouches[0].clientX - lbStartX;
      var dy = e.changedTouches[0].clientY - lbStartY;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) openLightbox(curImg + 1);
        else openLightbox(curImg - 1);
      }
    }, { passive: true });

    /* 键盘：灯箱 / 影院播放器快捷键 */
    document.addEventListener('keydown', function (e) {
      if (lb.classList.contains('open')) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') openLightbox(curImg - 1);
        else if (e.key === 'ArrowRight') openLightbox(curImg + 1);
      } else if (player.classList.contains('open')) {
        if (e.key === 'Escape') {
          if (fsEl()) fsExit(); else closePlayer();
        } else if (e.key === ' ') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'ArrowLeft') {
          seekBy(-5);
        } else if (e.key === 'ArrowRight') {
          seekBy(5);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          changeVol(0.1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          changeVol(-0.1);
        } else if (e.key.toLowerCase() === 'f') {
          toggleFullscreen();
        } else if (e.key.toLowerCase() === 'm') {
          toggleMute();
        }
      }
    });

    /* 影院播放器（自定义控制条/进度/全屏/自动隐藏） */
    bindPlayerEvents();

    /* 卡片点击（事件委托） */
    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.nas-wall-card') : null;
      if (!card) return;
      var i = parseInt(card.getAttribute('data-i'), 10);
      var f = files[i];
      if (!f) return;
      if (f.type === 'dir-up' || f.type === 'dir') { window.location.href = f.url; return; }
      if (f.type === 'image') {
        var idx = findImageIndex(f.url);
        if (idx >= 0) openLightbox(idx);
        return;
      }
      if (f.type === 'video') { openPlayer(f.url, f.name, true); return; }
      if (f.type === 'video-dl') { openPlayer(f.url, f.name, false); return; }
      /* 普通文件 → 新窗口打开/下载 */
      window.open(f.url, '_blank', 'noopener');
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    buildUI();
    bindEvents();
    enhanceRows();
    restoreView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* 加载成功标志：供模板中的"外链优先 + 本地兜底"判断 */
  window.__nasLoaded = true;
})();
