/* Play the user's LIGHTNING opening without reinterpreting its motion or slogan.
 * Canvas preserves the existing responsive stage and skip/replay contract. */
(function () {
  'use strict';
  window.startLightningBoot = function (canvas, onEnd) {
    var ctx = canvas.getContext('2d');
    if (!ctx) { setTimeout(onEnd, 0); return function () {}; }
    var video = document.createElement('video');
    var stopped = false, raf = 0;
    video.muted = true; video.defaultMuted = true;
    video.playsInline = true; video.preload = 'auto';
    video.setAttribute('playsinline', '');
    // Expose media time for browser checks and responsive previews.
    canvas.bootVideo = video;
    function resize() {
      var box = canvas.getBoundingClientRect(), density = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(box.width * density));
      canvas.height = Math.max(1, Math.round(box.height * density));
      draw();
    }
    function draw() {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (video.readyState < 2) return;
      var scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      var w = video.videoWidth * scale, h = video.videoHeight * scale;
      ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      canvas.dataset.frame = (video.currentTime * 30).toFixed(2);
    }
    function stop() {
      if (stopped) return;
      stopped = true; cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', resize);
      if (observer) observer.disconnect();
      video.removeEventListener('ended', finish); video.removeEventListener('error', finish);
      video.pause(); video.removeAttribute('src'); video.load();
      if (canvas.bootVideo === video) delete canvas.bootVideo;
    }
    function finish() { if (!stopped) { stop(); onEnd(); } }
    function frame() { if (!stopped) { draw(); raf = requestAnimationFrame(frame); } }
    var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resize(); window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    if (observer) observer.observe(canvas);
    video.addEventListener('ended', finish); video.addEventListener('error', finish);
    video.src = canvas.dataset.video;
    raf = requestAnimationFrame(frame);
    video.play().catch(function () { if (!stopped) finish(); });
    return stop;
  };
})();
