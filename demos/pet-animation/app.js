(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('pet-canvas'), ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const atlas = new Image(), sleepImage = new Image(), poses = new Image();
  const loaded = { atlas: false, sleep: false, poses: false };
  const skills = { literature: { name: '文献寻踪', accent: '#a18bc8' }, garden: { name: '灵感拾叶', accent: '#90a96f' } };
  const words = {
    idle: ['安静陪着你', '我在呢。要一起待一会儿吗？', 'MIMO 正在安静呼吸。没有任务，也可以好好待着。', '日常待机'],
    sleeping: ['打个小盹', '呼……就在这里，睡一小会儿。', '它只是睡着了。没有分析，也没有偷偷忙碌。', '自然休息'],
    waking: ['慢慢醒来', '嗯？我醒着啦。', '听到你的招呼，小家伙慢慢睁开眼睛。', '唤醒'],
    happy: ['挥挥小爪子', '嘿嘿，收到一点点喜欢。', 'MIMO 抬起前爪，向你挥了挥。', '挥爪回应'],
    curious: ['看看这边', '嗯？那边有什么呀。', '它歪过脑袋，耳朵也跟着换了个方向。', '转头观察'],
    stretching: ['伸个懒腰', '唔——舒展开啦。', '小家伙向前伸出两只爪子，慢慢舒展身体。', '舒展姿态'],
    activating: ['正在发动技能', '', '发动动作正在播放，模拟任务还没有完成。', '专属发动'],
    working: ['正在认真忙碌', '收到，让我把这些小线索理一理。', '模拟进行中。两个技能共用这套认真工作的动作。', '通用 · 进行中'],
    completed: ['这次顺利完成', '整理好啦，给你！', '模拟完成：MIMO 轻轻跃起。此处没有真实检索结果。', '通用 · 完成'],
    partial: ['完成了一部分', '先把找到的这些交给你，剩下的还要再找找。', '模拟部分完成：保留已有进展，没有假装全部完成。', '通用 · 部分完成'],
    failed: ['遇到一点困难', '这次卡住啦。换个办法，再试一次吧。', '模拟失败：小家伙停下来，轻轻歪头。', '通用 · 失败'],
    canceled: ['先停在这里', '好，先收起来。我还在这儿。', '任务已取消。后续模拟回调已停止，不会偷偷变成完成。', '通用 · 取消']
  };
  let roomWidth = 0, roomHeight = 0, frameId = 0, lastFrame = -1;
  let tourGeneration = 0, tourRunning = false;
  let state;
  function update(view) {
    document.body.dataset.mode = view.mode;
    const row = words[view.mode];
    $('state-label').textContent = row[0];
    $('speech').textContent = view.mode === 'activating'
      ? (view.skill === 'literature' ? '文献寻踪——线索们，往这里来。' : '灵感拾叶——小想法，慢慢冒芽吧。') : row[1];
    $('moment-text').textContent = row[2]; $('phase-tag').textContent = row[3];
    $('room-hint').textContent = view.mode === 'sleeping' ? '轻轻点它一下，就能叫醒它' : view.busy ? '你可以随时取消这次模拟任务' : '轻轻点它一下，打个招呼';
    $('rest-copy').innerHTML = view.mode === 'sleeping' ? '叫醒 MIMO<small>它随时愿意回应你</small>' : '打个小盹<small>睡觉，也可以只是休息</small>';
    for (const b of document.querySelectorAll('[data-skill]')) { b.disabled = view.busy; b.setAttribute('aria-busy', String(view.busy && b.dataset.skill === view.skill)); }
    $('cancel-task').disabled = !view.busy; $('rest').disabled = view.busy;
    $('outcome').disabled = view.busy; $('greet').disabled = view.busy;
    $('look').disabled = view.busy; $('stretch').disabled = view.busy;
  }
  state = new MomiyuState.PetState({ onChange: update });
  update(state.snapshot());
  function stopTour() { tourGeneration++; tourRunning = false; $('tour').querySelector('span').textContent = '看一段小日常'; }
  function userAction(fn) { stopTour(); return fn(); }
  $('greet').addEventListener('click', () => userAction(() => state.greet()));
  $('look').addEventListener('click', () => userAction(() => state.gesture('curious')));
  $('stretch').addEventListener('click', () => userAction(() => state.gesture('stretching')));
  $('rest').addEventListener('click', () => userAction(() => state.mode === 'sleeping' ? state.wake() : state.sleep()));
  canvas.addEventListener('click', () => userAction(() => state.greet()));
  canvas.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); userAction(() => state.greet()); } });
  for (const button of document.querySelectorAll('[data-skill]')) button.addEventListener('click', () => userAction(() => state.startSkill(button.dataset.skill, $('outcome').value)));
  $('cancel-task').addEventListener('click', () => userAction(() => state.cancel()));
  $('reset').addEventListener('click', () => userAction(() => { $('outcome').value = 'completed'; state.reset(); }));
  $('tour').addEventListener('click', async () => {
    if (tourRunning) { stopTour(); state.reset(); return; }
    stopTour(); const token = tourGeneration; tourRunning = true;
    $('tour').querySelector('span').textContent = '结束这段小日常'; state.reset();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const valid = () => token === tourGeneration;
    await wait(1200); if (!valid()) return; state.greet();
    await wait(1900); if (!valid()) return; state.sleep();
    await wait(3500); if (!valid()) return; state.wake();
    await wait(1900); if (!valid()) return; state.startSkill('literature', 'completed');
    await wait(10200); if (!valid()) return; state.startSkill('garden', 'completed');
    await wait(10200); if (!valid()) return; stopTour();
  });
  atlas.onload = () => { loaded.atlas = true; };
  poses.onload = () => { loaded.poses = true; };
  sleepImage.onload = () => { loaded.sleep = true; };
  const assetFailure = () => { $('asset-error').hidden = false; };
  atlas.onerror = assetFailure; sleepImage.onerror = assetFailure; poses.onerror = assetFailure;
  atlas.src = 'assets/reference-atlas.png'; sleepImage.src = 'assets/sleep.png'; poses.src = 'assets/body-poses.png';
  function resize() {
    const r = canvas.getBoundingClientRect(); roomWidth = r.width; roomHeight = r.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * ratio); canvas.height = Math.round(r.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = t => 1 - Math.pow(1 - clamp(t), 3);
  function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  function star(x, y, size, color, rotation = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.quadraticCurveTo(size * .16, -size * .16, size, 0); ctx.quadraticCurveTo(size * .16, size * .16, 0, size); ctx.quadraticCurveTo(-size * .16, size * .16, -size, 0); ctx.quadraticCurveTo(-size * .16, -size * .16, 0, -size); ctx.fill(); ctx.restore();
  }
  function leaf(x, y, size, rotation, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha *= alpha;
    ctx.fillStyle = '#a0b584'; ctx.beginPath(); ctx.moveTo(-size, 0); ctx.bezierCurveTo(-size, -size, size * .7, -size * .8, size, 0); ctx.bezierCurveTo(size * .4, size * .7, -size * .6, size * .8, -size, 0); ctx.fill();
    ctx.strokeStyle = '#f0f3df'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-size * .7, 0); ctx.lineTo(size * .6, 0); ctx.stroke(); ctx.restore();
  }
  function note(x, y, size, angle, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha *= alpha;
    ctx.fillStyle = '#fffdf7'; ctx.strokeStyle = '#b9a7d6'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(-size * .65, -size * .8, size * 1.3, size * 1.6, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#c8bbde'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-size * .35, -size * .35 + i * size * .35); ctx.lineTo(size * .35, -size * .35 + i * size * .35); ctx.stroke(); } ctx.restore();
  }
  function drawActor(image, source, x, y, targetWidth, alpha, rotation, scaleX = 1, scaleY = 1) {
    if (alpha <= 0 || !image.complete || !image.naturalWidth) return;
    const h = targetWidth * source[3] / source[2];
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scaleX, scaleY);
    ctx.drawImage(image, ...source, -targetWidth * .5, -h, targetWidth, h); ctx.restore();
  }
  function bodyPose(mode, elapsed, time) {
    if (reducedMotion) return mode === 'stretching' ? 5 : mode === 'curious' ? 4 : mode === 'happy' ? 2 : 0;
    if (mode === 'happy' || mode === 'completed') return [0, 1, 2, 3, 2, 1, 0][Math.min(6, Math.floor(elapsed / .18))];
    if (mode === 'curious' || mode === 'failed' || mode === 'partial') return elapsed > .2 && elapsed < 1.8 ? 4 : 0;
    if (mode === 'stretching' || mode === 'waking') return elapsed > .15 && elapsed < 1.2 ? 5 : 0;
    if (mode === 'activating') return state.skill === 'literature' ? [0, 1, 2, 2, 1, 0][Math.min(5, Math.floor(elapsed / .3))] : elapsed > .2 && elapsed < 1.4 ? 5 : 0;
    if (mode === 'working') return time % 3 < .65 ? 4 : 0;
    if (mode === 'idle') { const phase = time % 13; return phase > 5 && phase < 6.4 ? 4 : phase > 10 && phase < 11.2 ? 5 : 0; }
    return 0;
  }
  function drawBody(index, x, y, size, alpha, scaleX, scaleY) {
    if (!loaded.poses) { drawActor(atlas, [548, 224, 226, 200], x, y, size, alpha, 0, scaleX, scaleY); return; }
    const cw = poses.naturalWidth / 3, ch = poses.naturalHeight / 2;
    const frameWidth = size * 1.32, frameHeight = frameWidth * ch / cw;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scaleX, scaleY);
    const baseline = index < 3 ? .94 : .84;
    ctx.drawImage(poses, index % 3 * cw, Math.floor(index / 3) * ch, cw, ch, -frameWidth * .5, -frameHeight * baseline, frameWidth, frameHeight); ctx.restore();
  }
  function draw(now) {
    frameId = requestAnimationFrame(draw);
    if (document.hidden || now - lastFrame < 30 || !roomWidth) return;
    lastFrame = now; const w = roomWidth, h = roomHeight; ctx.clearRect(0, 0, w, h);
    const s = state.snapshot(), elapsed = Math.max(0, now - s.since) / 1000;
    const motion = reducedMotion ? 0 : now / 1000;
    const x = w * .5, floorY = h * .79;
    const size = Math.min(w * .45, h * .49, 315);
    const sleeping = s.mode === 'sleeping';
    let sleepMix = sleeping ? ease(elapsed / .65) : s.mode === 'waking' ? 1 - ease(elapsed / .65) : 0;
    if (!loaded.sleep) sleepMix = 0;
    let y = floorY, angle = 0, sx = 1 + Math.sin(motion * 1.7) * .006, sy = 1 + Math.sin(motion * 1.7) * .013;
    if (!reducedMotion) {
      angle = 0;
      if (s.mode === 'happy' || s.mode === 'completed') { const hop = Math.max(0, Math.sin(Math.min(elapsed, .9) / .9 * Math.PI)); y -= hop * 5; }
      if (s.mode === 'working') sy = 1 + Math.sin(motion * 2.3) * .006;
      if (s.mode === 'waking') { sx += Math.sin(clamp(elapsed / 1.2) * Math.PI) * .045; sy += Math.sin(clamp(elapsed / 1.2) * Math.PI) * .045; }
    }
    // Ambient dust is local motion, independent of tasks or model activity.
    for (let i = 0; i < 9; i++) {
      const px = w * (.17 + i * .083) + Math.sin(motion * .23 + i) * 12;
      const py = h * (.30 + (i % 4) * .105) + Math.sin(motion * .4 + i * 2) * 9;
      ellipse(px, py, i % 3 === 0 ? 1.7 : 1.1, i % 3 === 0 ? 1.7 : 1.1, '#b4bf9860');
    }
    ctx.save(); ctx.filter = 'blur(8px)'; ellipse(x, floorY + 4, size * .33 + sleepMix * 20, 10, '#79845a23'); ctx.restore();
    // Activation effects are deliberately distinct, while later feedback is shared.
    if (s.mode === 'activating') {
      const p = clamp(elapsed / 1.8), strength = Math.sin(p * Math.PI);
      ctx.save(); ctx.globalAlpha = reducedMotion ? .75 : Math.min(1, strength * 2);
      if (s.skill === 'literature') {
        ctx.strokeStyle = '#b7a0d9'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, floorY - size * .38, size * .65, size * .34, -.15, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 5; i++) { const a = (reducedMotion ? .8 : p * 4) + i * Math.PI * 2 / 5; note(x + Math.cos(a) * size * .61, floorY - size * .5 + Math.sin(a) * size * .29, 12 + i % 2 * 3, Math.sin(a) * .3); }
        for (let i = 0; i < 8; i++) { const a = i * 2.4 + p * 2; star(x + Math.cos(a) * size * .65, floorY - size * .47 + Math.sin(a) * size * .51, 3 + i % 3, '#b29bcb', a); }
      } else {
        ctx.strokeStyle = '#a9ba8a99'; ctx.lineWidth = 1.3; ctx.beginPath();
        for (let i = 0; i <= 70; i++) { const a = i / 70 * Math.PI * 2; const px = x + Math.cos(a) * size * .58, py = floorY - size * .33 + Math.sin(a) * size * .30; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + (reducedMotion ? 0 : p * 2.2); leaf(x + Math.cos(a) * size * (.4 + .2 * strength), floorY - size * .4 + Math.sin(a) * size * .43, 9 + i % 3 * 2, a + Math.PI / 4); }
      }
      ctx.restore();
    }
    drawBody(bodyPose(s.mode, elapsed, motion), x, y, size, loaded.atlas ? 1 - sleepMix : 0, sx, sy);
    drawActor(sleepImage, [100, 350, 1080, 550], x, floorY + 3, size * 1.22, sleepMix, Math.sin(motion * .6) * .004, 1 + Math.sin(motion * 1.4) * .006, 1 + Math.sin(motion * 1.4) * .015);
    if (sleepMix > .5) {
      ctx.save(); ctx.globalAlpha = sleepMix * .55; ctx.fillStyle = '#aa98bc';
      for (let i = 0; i < 3; i++) { const q = reducedMotion ? i * .3 : (motion * .18 + i / 3) % 1; ctx.globalAlpha = sleepMix * Math.sin(q * Math.PI) * .55; ctx.font = `${11 + q * 8}px Georgia`; ctx.fillText('z', x - size * .35 + q * 23, floorY - size * .45 - q * 60); } ctx.restore();
    }
    if (s.mode === 'working') {
      for (let i = 0; i < 3; i++) { const a = (reducedMotion ? 0 : motion * 1.4) + i * Math.PI * 2 / 3; star(x + Math.cos(a) * size * .5, floorY - size * .91 + Math.sin(a) * 7, 3.5, '#b8ae90', a); }
    }
    if (s.mode === 'completed' || s.mode === 'happy') {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - elapsed / 2.3);
      for (let i = 0; i < 7; i++) { const a = -Math.PI + i / 6 * Math.PI; star(x + Math.cos(a) * (size * .55 + elapsed * 15), floorY - size * .5 + Math.sin(a) * (size * .52 + elapsed * 12), 4 + i % 3, '#c2ad76', i); } ctx.restore();
    }
    if (['failed', 'canceled', 'partial'].includes(s.mode)) {
      const label = { failed: '…', canceled: '好', partial: '再找找' }[s.mode];
      ctx.fillStyle = '#a09988'; ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x + size * .48, floorY - size * .83); ctx.textAlign = 'start';
    }
  }
  frameId = requestAnimationFrame(draw);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastFrame = -1; });
  window.addEventListener('pagehide', () => { stopTour(); state.destroy(); cancelAnimationFrame(frameId); });
  // Read-only inspection hook for local QA; no task execution or data collection.
  window.momiyuDemo = { get state() { return state.snapshot(); }, get assetsReady() { return loaded.atlas && loaded.sleep && loaded.poses; }, get reducedMotion() { return reducedMotion; }, get bodyPose() { return bodyPose(state.mode, (performance.now() - state.since) / 1000, performance.now() / 1000); } };
})();
