/* VELTRIX opening, matching the approved 121-frame / 30fps animation.
 * Canvas playback keeps offline use, skip/replay and responsive rendering.
 * The website keeps its existing silent autoplay behavior.
 */
(function () {
  'use strict';
  function k(f, times, values) {
    if (f <= times[0]) return values[0];
    for (var i = 1; i < times.length; i++) if (f <= times[i]) {
      return values[i - 1] + (values[i] - values[i - 1]) * (f - times[i - 1]) / (times[i] - times[i - 1]);
    }
    return values[values.length - 1];
  }
  // Cubic-bezier(.22, 1, .36, 1), shared with the approved Remotion motion.
  function ease(t) {
    t = Math.max(0, Math.min(1, t));
    var lo = 0, hi = 1, u;
    for (var i = 0; i < 16; i++) {
      u = (lo + hi) / 2;
      var x = 3 * (1-u) * (1-u) * u * .22 + 3 * (1-u) * u * u * .36 + u * u * u;
      if (x < t) lo = u; else hi = u;
    }
    return 1 - Math.pow(1 - (lo + hi) / 2, 3);
  }
  // Retain the entry point used by the calculator's startup orchestrator.
  window.startLightningBoot = function (canvas, onEnd) {
    var ctx = canvas.getContext('2d'), stopped = false, raf = 0, start = null;
    if (!ctx) { onEnd(); return function () {}; }
    var width = 0, height = 0, density = 1;
    function resize() {
      var bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      density = Math.min(2, window.devicePixelRatio || 1);
      var pw = Math.round(width * density), ph = Math.round(height * density);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    }
    resize(); window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    function stop() {
      stopped = true; cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', resize);
      if (observer) observer.disconnect();
    }
    var logo = new Image();
    logo.onerror = function () { if (!stopped) { stop(); onEnd(); } };
    logo.onload = function () {
      if (stopped) return;
      function haze(x, y, rx, ry, opacity, color) {
        ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.globalAlpha = opacity;
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, color); g.addColorStop(.4, 'rgba(127,0,21,.09)'); g.addColorStop(1, 'rgba(118,0,21,0)');
        ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
      }
      function emblem(x, y, opacity, blur, brightness) {
        ctx.save(); ctx.globalAlpha *= opacity;
        ctx.filter = (blur ? 'blur('+blur+'px) ' : '') + 'brightness('+brightness+')';
        ctx.drawImage(logo, 180, 210, 385, 365, x, y, 270, 256); ctx.restore();
      }
      function frame(now) {
        if (stopped) return;
        if (start === null) start = now;
        var f = (now - start) * .03;
        if (f >= 121) { stop(); onEnd(); return; }
        canvas.dataset.frame = f.toFixed(2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save(); ctx.scale(density, density);
        // Fit the full horizontal logo on phones while preserving the landscape framing.
        var fit = Math.min(width / (height > width ? 1100 : 1920), height / 1080, 1.5);
        ctx.translate(width/2, height/2); ctx.scale(fit, fit); ctx.translate(-960, -540);
        ctx.globalCompositeOperation = 'screen';
        haze(1651, 54, 1250, 900, k(f,[17,21,25,28,35,43],[0,.18,.65,.35,.08,0]), 'rgba(215,0,37,.68)');
        haze(960, 508, 590, 360, k(f,[15,19,23,25,28,34,43],[0,.3,.7,1,.36,.07,0]), 'rgba(255,0,40,.34)');
        var bloom = k(f,[25,27,29,32,38,42],[0,1,.85,.45,.12,0]);
        var echo = k(f,[26,28,31,35,41],[1,.88,.47,.15,0]);
        var move = ease((f-41)/19);
        var scale = Math.exp(k(f,[26,28,33,41],[Math.log(1.13),Math.log(1.08),Math.log(1.025),0]));
        ctx.save(); ctx.globalAlpha = k(f,[25,26,27,29],[0,.12,.78,1]);
        ctx.translate(960-340*move,510); ctx.scale(scale,scale); ctx.translate(-135,-128);
        emblem(0,0,bloom*.8,16,1); emblem(0,0,bloom*.65,5,2);
        emblem(-22*echo,-19*echo,echo*.32,2,1); emblem(18*echo,17*echo,echo*.26,1,1);
        emblem(0,0,1,0,1+bloom*.7); ctx.restore();
        var reveal = ease((f-42)/19);
        if (reveal > 0) {
          ctx.save(); ctx.translate(755+35*(1-reveal),466);
          ctx.globalAlpha = k(f,[42,46,56,62],[0,.28,.85,1]);
          ctx.beginPath(); ctx.rect(0,0,679*reveal,126); ctx.clip();
          ctx.filter = 'blur('+k(f,[42,51,61],[2.5,.6,0])+'px)';
          ctx.drawImage(logo,566,330,970,180,0,0,679,126); ctx.restore();
        }
        var length = k(f,[15,17,19,21,24,26],[0,270,730,1230,2000,2140]);
        var blade = k(f,[15,17,19,23,25,26,27],[0,.55,1,1,.87,.30,0]);
        if (blade > 0 && length > 0) {
          ctx.save(); ctx.translate(960,510); ctx.rotate(43.5*Math.PI/180); ctx.globalAlpha = blade;
          haze(0,0,length*.48,118,.6,'rgba(255,23,76,.95)');
          var gradient = ctx.createLinearGradient(-length/2,0,length/2,0);
          [[0,'rgba(255,0,51,0)'],[.12,'#ff214b'],[.43,'#ff9fb4'],[.5,'#fffaff'],[.6,'#ff85a3'],[.9,'#ff1645'],[1,'rgba(255,0,51,0)']].forEach(function(s){gradient.addColorStop(s[0],s[1]);});
          function ray(a,b,y,thickness,blur,opacity) {
            ctx.save(); ctx.globalAlpha *= opacity; ctx.filter = blur ? 'blur('+blur+'px)' : 'none';
            ctx.strokeStyle = gradient; ctx.lineWidth = thickness; ctx.beginPath(); ctx.moveTo(a,y); ctx.lineTo(b,y); ctx.stroke(); ctx.restore();
          }
          ray(-length/2,length/2,0,36,26,.8); ray(-length/2,length/2,0,12,8,1);
          ray(-length/2,length/2,0,4.5,1.8,1); ray(-length/2,length/2,0,2.1,0,1);
          ray(-178,146,-32,7,3,.28); ray(-118,112,-52,4,3,.28); ray(-140,189,38,5,3,.2);
          ctx.restore();
        }
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = k(f,[23,24,25,26,27],[0,.09,.025,.006,0]);
        ctx.fillStyle = '#ff1640'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore();
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    };
    logo.src = canvas.dataset.logo;
    return stop;
  };
})();
