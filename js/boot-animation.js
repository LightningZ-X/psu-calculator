/* Native, time-driven reconstruction of the approved V2. No video decoder.
 * Full viewport stage; the reference composition scales uniformly on every device.
 * Keyframes retain the reference's 30 fps timing; rendering uses display RAF.
 */
(function () {
  'use strict';
  var k = function (f, times, values) {
    if (f <= times[0]) return values[0];
    for (var i = 1; i < times.length; i++) if (f <= times[i]) {
      return values[i - 1] + (values[i] - values[i - 1]) * (f - times[i - 1]) / (times[i] - times[i - 1]);
    }
    return values[values.length - 1];
  };
  window.startLightningBoot = function (canvas, onEnd) {
    var ctx = canvas.getContext('2d'), stopped = false, raf = 0, start = null;
    if (!ctx) { onEnd(); return function () {}; }
    var width = 0, height = 0, density = 1;
    function resize() {
      var bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      density = Math.min(2, window.devicePixelRatio || 1);
      var pixelWidth = Math.round(width * density), pixelHeight = Math.round(height * density);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth; canvas.height = pixelHeight;
      }
    }
    resize(); window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    function stop() {
      stopped = true; cancelAnimationFrame(raf); window.removeEventListener('resize', resize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', resize);
      if (observer) observer.disconnect();
    }
    function image(src) {
      return new Promise(function (resolve, reject) {
        var img = new Image(); img.onload = function () { resolve(img); }; img.onerror = reject; img.src = src;
      });
    }
    function tint(img, color) {
      var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in';
      x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c;
    }
    Promise.all([image(canvas.dataset.mark), image(canvas.dataset.wordmark)]).then(function (imgs) {
      if (stopped) return;
      var mark = tint(imgs[0], '#ff051f'), pink = tint(imgs[0], '#ff1a40'), word = tint(imgs[1], '#ff0730');
      function haze(x, y, rx, ry, opacity) {
        ctx.save(); ctx.translate(x,y); ctx.scale(rx,ry); ctx.globalAlpha = opacity;
        var g = ctx.createRadialGradient(0,0,0,0,0,1);
        g.addColorStop(0,'rgba(255,0,49,.9)'); g.addColorStop(.32,'rgba(191,0,29,.48)'); g.addColorStop(1,'rgba(160,0,22,0)');
        ctx.fillStyle=g; ctx.fillRect(-1,-1,2,2); ctx.restore();
      }
      function glyph(dx,dy,alpha,blur,img) {
        ctx.save(); ctx.globalAlpha *= alpha; ctx.filter = blur ? 'blur('+blur+'px)' : 'none';
        ctx.drawImage(img || mark,607+dx,270+dy,66,121); ctx.restore();
      }
      function frame(now) {
        if (stopped) return;
        if (start === null) start=now;
        var f=(now-start)*.03;
        if (f>=121) { stop(); onEnd(); return; }
        canvas.dataset.frame=f.toFixed(2);
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.save(); ctx.globalAlpha=k(f,[16,17,18,19,20,21,22,23,24,36],[0,.013,.025,.04,.06,.33,.07,.055,0,0]);
        ctx.fillStyle='#c50020'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore();
        ctx.save();
        // Keep the logo and lettering as one undistorted unit. Portrait stages
        // enlarge the focal content; atmospheric rays may extend beyond the edge.
        var fit = Math.min(width / (height > width ? 480 : 1280), height / 720, 1.5);
        ctx.scale(density, density);
        ctx.translate(width / 2, height / 2);
        ctx.scale(fit, fit); ctx.translate(-640,-360);
        haze(655,335,710,510,k(f,[16,17,19,20,21,22,23,24,28,34,40],[0,.05,.19,.24,.68,.25,.15,.085,.046,.012,0]));
        haze(1220,20,680,580,k(f,[18,21,23,24,30,36,42],[0,.16,.29,.24,.09,.035,0]));
        var settle=k(f,[23,24,25,27,30,34,40],[1,1,.8,.6,.35,.16,0]);
        var glow=k(f,[23,24,26,30,34,40],[.1,.5,1,.58,.22,0]);
        var scale=k(f,[23,24,25,28,32,40],[1.08,1.1,1.08,1.055,1.02,1]);
        ctx.save(); ctx.globalAlpha=k(f,[21,23,24,25,26,30,39],[0,.13,.7,.93,1,1,1]);
        ctx.translate(640,332); ctx.scale(scale,scale); ctx.translate(-640,-332);
        glyph(0,0,glow*.52,15); glyph(0,0,glow*.9,5);
        glyph(-17*settle,-17*settle,settle*.26,2.5); glyph(16*settle,16*settle,settle*.3,2); glyph(7*settle,7*settle,settle*.35,1);
        glyph(0,0,1,0); glyph(0,0,glow*.72,0,pink); ctx.restore();
        var length=k(f,[16,17,18,20,23],[0,390,910,1130,1190]);
        var beam=k(f,[0,16,17,18,19,20,21,22,23,24],[0,0,.32,.68,.91,1,1,.95,.8,0]);
        if (beam>0) {
          ctx.save(); ctx.translate(640,325.3); ctx.rotate(143.08*Math.PI/180); ctx.globalAlpha=beam;
          ctx.save(); ctx.globalAlpha*=.28; ctx.filter='blur(31px)'; ctx.fillStyle='#f9002f'; ctx.beginPath(); ctx.ellipse(0,0,length*.46,73,0,0,Math.PI*2); ctx.fill(); ctx.restore();
          var gradient=ctx.createLinearGradient(-length/2,0,length/2,0);
          [[0,'#ff194600'],[.13,'#ff4065'],[.5,'#fff8ff'],[.88,'#ff3765'],[1,'#ff173900']].forEach(function(s){gradient.addColorStop(s[0],s[1]);});
          function ray(x1,x2,y,width,blur) {ctx.filter=blur?'blur('+blur+'px)':'none';ctx.strokeStyle=gradient;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();}
          [[24,19],[8,6],[3.2,1.3],[1.7,0]].forEach(function(s){ray(-length/2,length/2,0,s[0],s[1]);});
          ctx.globalAlpha*=.28;
          [-1,1].forEach(function(v){ray(-150+v*13,140+v*13,v*29,5,2);ray(-90+v*13,75+v*13,v*29+16,3,2);});ctx.restore();
        }
        if(f>=20 && f<=22){ctx.save();ctx.globalAlpha=k(f,[20,21,22],[.08,.35,.08]);ctx.globalCompositeOperation='screen';ctx.filter='blur(2px)';ctx.fillStyle='#ff3050';ctx.beginPath();ctx.ellipse(665,363,330,1.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
        for(var i=0;i<12;i++) {
          ctx.save();ctx.globalAlpha=k(f,[41,43,47,52,57,60],[0,.17,.5,.79,.97,1])*k(f,[42+i*.73,47+i*.85,57+i*.22],[0,.62,1]);
          ctx.translate(k(f,[42,51,59],[i%2?3:-3,1,0]),0);ctx.beginPath();ctx.rect(545+i*190/12,408,190/12+.2,49);ctx.clip();
          ctx.filter='blur('+k(f,[42,49,57],[1.1,.45,0])+'px)';ctx.drawImage(word,545,408,190,28.59);
          ctx.fillStyle='#ff0730';ctx.font='700 12.2px Arial';ctx.textAlign='center';ctx.fillText('build to be perfect',640,448);ctx.restore();
        }
        ctx.restore(); raf=requestAnimationFrame(frame);
      }
      raf=requestAnimationFrame(frame);
    }).catch(function () { if(!stopped) { stop(); onEnd(); } });
    return stop;
  };
})();
