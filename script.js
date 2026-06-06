/* ============================================
   TAPASYA — STRICT DISCIPLINE SYSTEM
   No switching. No flexibility. Sequential only.
   ============================================ */
(function () {
  'use strict';

  /* ── Constants ────────────────────────────── */
  const STORE_KEY   = 'tapasyaState';
  const TASK_MS     = 1.5 * 60 * 60 * 1000; // 1.5 hours per task
  const BREAK_MS    = 20 * 60 * 1000;       // 20-min break between tasks
  const CYCLE_MS    = 6 * 60 * 60 * 1000;   // 6 hours total
  const CHECK_MS    = 20 * 60 * 1000;       // 20-min discipline check
  const BEEP_MS     = 5000;
  const MAX_TASKS   = 3;

  /* ── Audio ────────────────────────────────── */
  let _actx = null;
  function beep(ms) {
    try {
      if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
      const o = _actx.createOscillator();
      const g = _actx.createGain();
      o.type = 'square';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.12, _actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + ms / 1000);
      o.connect(g).connect(_actx.destination);
      o.start();
      o.stop(_actx.currentTime + ms / 1000);
    } catch (_) {}
  }

  /* ── State ────────────────────────────────── */
  function blank() {
    return {
      tasks: [],
      currentIdx: 0,       // which task is current (strict sequential)
      cycleStart: null,     // timestamp when cycle began
      taskStart: null,      // timestamp when current task started
      breakStart: null,     // timestamp when break started (null = no break)
      locked: false,        // true once cycle begins
      ended: false,         // true when cycle timer expires
      checkAt: null,        // last discipline check timestamp
      checkIgnored: false,
    };
  }

  let S = blank();
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(S));
  function load() {
    try {
      const r = localStorage.getItem(STORE_KEY);
      if (r) { S = Object.assign(blank(), JSON.parse(r)); return true; }
    } catch (_) {}
    S = blank();
    return false;
  }

  /* ── DOM ──────────────────────────────────── */
  const $ = id => document.getElementById(id);

  const D = {
    cPhase:      $('creation-phase'),
    ePhase:      $('execution-phase'),
    countLabel:  $('task-count-label'),
    counterFill: $('counter-fill'),
    taskForm:    $('task-form'),
    titleIn:     $('task-title'),
    motivIn:     $('task-motivation'),
    subList:     $('subtask-list'),
    addSubBtn:   $('add-subtask-btn'),
    saveBtn:     $('save-task-btn'),
    committed:   $('committed-tasks'),
    cActions:    $('creation-actions'),
    beginBtn:    $('begin-cycle-btn'),
    taskTimer:   $('task-timer'),
    cycleTimer:  $('cycle-timer'),
    cycleProg:   $('cycle-progress'),
    track:       $('cards-track'),
    prevBtn:     $('card-prev'),
    nextBtn:     $('card-next'),
    dots:        $('card-dots'),
    detailMotiv: $('detail-motivation'),
    detailSubs:  $('detail-subtasks'),
    detailLog:   $('detail-log'),
    detailLogE:  $('detail-log-entries'),
    btnStart:    $('action-start'),
    btnComplete: $('action-complete'),
    hgSvg:       $('hourglass-svg'),
    sandTop:     $('sand-top'),
    sandBot:     $('sand-bottom'),
    sandStr:     $('sand-stream'),
    mComplete:   $('modal-complete'),
    compExit:    $('complete-step-exit'),
    compForm:    $('complete-step-form'),
    exitNo:      $('exit-no'),
    exitYes:     $('exit-yes'),
    compSummary: $('complete-summary'),
    compRange:   $('complete-satisfaction'),
    compRangeV:  $('satisfaction-value'),
    compSubmit:  $('complete-submit'),
    mDiscipline: $('modal-discipline'),
    discTitle:   $('discipline-title'),
    discSub:     $('discipline-subtitle'),
    discOk:      $('discipline-confirm'),
    oTaunt:      $('overlay-taunt'),
    tauntH:      $('taunt-heading'),
    tauntM:      $('taunt-message'),
    tauntDismiss:$('taunt-dismiss'),
    tauntNew:    $('taunt-new-cycle'),
    oSuccess:    $('overlay-success'),
    successNew:  $('success-new-cycle'),
    importBtn:   $('import-btn'),
    exportBtn:   $('export-btn'),
    importFile:  $('import-file'),
    exportExec:  $('export-btn-exec'),
  };

  let view = 0;
  let tickId = null;
  let checkTimer = null;

  /* ════════════════════════════════════════════
     BOOT
     ════════════════════════════════════════════ */
  function boot() {
    load();
    wire();
    if (S.locked && S.tasks.length) {
      enterExecution();
    } else if (S.tasks.length) {
      renderCommitted();
      syncCounter();
      if (S.tasks.length >= MAX_TASKS) D.taskForm.style.display = 'none';
    }
  }

  /* ════════════════════════════════════════════
     EVENTS
     ════════════════════════════════════════════ */
  function wire() {
    D.addSubBtn.addEventListener('click', addSub);
    D.saveBtn.addEventListener('click', commitTask);
    D.beginBtn.addEventListener('click', beginCycle);
    D.prevBtn.addEventListener('click', () => nav(-1));
    D.nextBtn.addEventListener('click', () => nav(1));
    D.btnStart.addEventListener('click', startTask);
    D.btnComplete.addEventListener('click', openComplete);

    D.exitNo.addEventListener('click', () => hide(D.mComplete));
    D.exitYes.addEventListener('click', () => {
      D.compExit.style.display = 'none';
      D.compForm.style.display = 'block';
    });
    D.compRange.addEventListener('input', () => D.compRangeV.textContent = D.compRange.value);
    D.compSubmit.addEventListener('click', submitComplete);
    D.discOk.addEventListener('click', dismissCheck);
    D.tauntDismiss.addEventListener('click', () => hide(D.oTaunt));
    D.tauntNew.addEventListener('click', newCycle);
    D.successNew.addEventListener('click', newCycle);

    D.importBtn.addEventListener('click', () => D.importFile.click());
    D.importFile.addEventListener('change', doImport);
    D.exportBtn.addEventListener('click', doExport);
    D.exportExec.addEventListener('click', doExport);

    // Touch swipe for cards
    let sx = 0;
    D.track.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    D.track.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) nav(dx > 0 ? -1 : 1);
    });
  }

  /* ════════════════════════════════════════════
     CREATION PHASE
     ════════════════════════════════════════════ */
  function addSub() {
    const row = document.createElement('div');
    row.className = 'sub-item';
    row.innerHTML = `<input type="text" placeholder="Subtask..." maxlength="120" autocomplete="off"/><button type="button" class="sub-remove" aria-label="Remove">×</button>`;
    row.querySelector('.sub-remove').addEventListener('click', () => row.remove());
    D.subList.appendChild(row);
    row.querySelector('input').focus();
  }

  function commitTask() {
    const title = D.titleIn.value.trim();
    const motiv = D.motivIn.value.trim();
    const subs = [];
    D.subList.querySelectorAll('input').forEach(i => {
      const v = i.value.trim();
      if (v) subs.push({ text: v, done: false });
    });
    if (!title) return shake(D.titleIn);
    if (!motiv) return shake(D.motivIn);
    if (!subs.length) { addSub(); return shake(D.addSubBtn); }
    if (S.tasks.length >= MAX_TASKS) return;

    S.tasks.push({
      title,
      motivation: motiv,
      subtasks: subs,
      status: 'pending',    // pending | active | completed
      completion: null,
    });
    save();
    D.titleIn.value = '';
    D.motivIn.value = '';
    D.subList.innerHTML = '';
    renderCommitted();
    syncCounter();
    if (S.tasks.length >= MAX_TASKS) D.taskForm.style.display = 'none';
  }

  function syncCounter() {
    const n = S.tasks.length;
    D.countLabel.textContent = `${n} / ${MAX_TASKS} tasks committed`;
    D.counterFill.style.width = `${(n / MAX_TASKS) * 100}%`;
    D.cActions.style.display = n >= 1 ? 'block' : 'none';
  }

  function renderCommitted() {
    D.committed.innerHTML = '';
    S.tasks.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'committed-card';
      el.draggable = true;
      el.innerHTML = `
        <div class="c-num">${i + 1}</div>
        <div class="c-info">
          <div class="c-title">${esc(t.title)}</div>
          <div class="c-meta">${t.subtasks.length} subtask${t.subtasks.length > 1 ? 's' : ''} · 2 hrs</div>
        </div>
        <button class="c-del" aria-label="Delete">×</button>`;
      el.querySelector('.c-del').addEventListener('click', e => { e.stopPropagation(); delTask(i); });
      el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', i); el.style.opacity = '.4'; });
      el.addEventListener('dragend', () => el.style.opacity = '');
      el.addEventListener('dragover', e => e.preventDefault());
      el.addEventListener('drop', e => { e.preventDefault(); reorder(+e.dataTransfer.getData('text/plain'), i); });
      D.committed.appendChild(el);
    });
  }

  function delTask(i) {
    if (S.locked) return;
    S.tasks.splice(i, 1); save();
    renderCommitted(); syncCounter();
    if (S.tasks.length < MAX_TASKS) D.taskForm.style.display = 'block';
  }

  function reorder(from, to) {
    if (S.locked || from === to) return;
    const [m] = S.tasks.splice(from, 1);
    S.tasks.splice(to, 0, m);
    save(); renderCommitted();
  }

  function beginCycle() {
    if (!S.tasks.length) return;
    S.locked = true;
    S.currentIdx = 0;
    S.cycleStart = null;  // starts when first task starts
    S.ended = false;
    save();
    enterExecution();
  }

  /* ════════════════════════════════════════════
     EXECUTION PHASE
     ════════════════════════════════════════════ */
  function enterExecution() {
    D.cPhase.style.display = 'none';
    D.ePhase.style.display = 'block';
    view = S.currentIdx;
    renderSlides();
    renderDetail();
    syncActions();
    startTick();
    scheduleCheck();

    if (S.ended) { showEnd(); }
    else if (S.cycleStart && Date.now() - S.cycleStart >= CYCLE_MS) endCycle();
  }

  /* ── Slides ─────────────────────────────── */
  function renderSlides() {
    D.track.innerHTML = '';
    D.dots.innerHTML = '';
    S.tasks.forEach((t, i) => {
      const sl = document.createElement('div');
      sl.className = 'slide';
      const isOnBreak = S.breakStart && i === S.currentIdx && t.status === 'pending';
      const cls = t.status === 'active' ? 'is-active' :
                  t.status === 'completed' ? 'is-done' :
                  isOnBreak ? 'is-break' : '';
      const lbl = t.status === 'active' ? 'ACTIVE' :
                  t.status === 'completed' ? 'COMPLETED' :
                  isOnBreak ? 'BREAK' : 'PENDING';
      const scls = t.status === 'active' ? 's-active' :
                   t.status === 'completed' ? 's-done' :
                   isOnBreak ? 's-break' : '';

      // Show order lock indicator
      const orderBadge = `<span style="opacity:0.4;font-size:0.6rem;">TASK ${i + 1} OF ${S.tasks.length}</span>`;

      const done = t.subtasks.filter(s => s.done).length;
      sl.innerHTML = `<div class="slide-card ${cls}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="slide-status ${scls}">${lbl}</div>
          ${orderBadge}
        </div>
        <div class="slide-title">${esc(t.title)}</div>
        <div class="slide-meta">${done}/${t.subtasks.length} subtasks</div>
      </div>`;
      D.track.appendChild(sl);

      const d = document.createElement('div');
      d.className = 'dot' + (i === view ? ' on' : '');
      d.addEventListener('click', () => { view = i; slide(); renderDetail(); syncActions(); });
      D.dots.appendChild(d);
    });
    slide();
  }

  function slide() {
    D.track.style.transform = `translateX(-${view * 100}%)`;
    D.dots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === view));
  }

  function nav(dir) {
    const n = view + dir;
    if (n < 0 || n >= S.tasks.length) return;
    view = n;
    slide();
    renderDetail();
    syncActions();
  }

  /* ── Detail Panel ───────────────────────── */
  function renderDetail() {
    const t = S.tasks[view];
    if (!t) return;
    D.detailMotiv.textContent = t.motivation;

    D.detailSubs.innerHTML = '';
    const isActive = t.status === 'active' && view === S.currentIdx;
    t.subtasks.forEach((s, si) => {
      const li = document.createElement('li');
      li.className = 'sub-check-row';
      li.innerHTML = `<div class="sub-checkbox ${s.done ? 'on' : ''} ${isActive ? '' : 'locked'}" data-i="${si}">✓</div>
        <span class="sub-text ${s.done ? 'crossed' : ''}">${esc(s.text)}</span>`;
      if (isActive) {
        li.querySelector('.sub-checkbox').addEventListener('click', () => {
          s.done = !s.done; save(); renderDetail(); renderSlides();
        });
      }
      D.detailSubs.appendChild(li);
    });

    // Hide log section (no switching in strict mode)
    D.detailLog.style.display = 'none';

    // Completion info
    const area = document.querySelector('.task-detail-area');
    let cc = area.querySelector('.completion-card');
    if (t.completion) {
      if (!cc) { cc = document.createElement('div'); cc.className = 'card detail-card completion-card'; area.appendChild(cc); }
      cc.innerHTML = `<h3 class="detail-label">Completion</h3>
        <p class="detail-text">${esc(t.completion.summary)}</p>
        <p class="detail-text" style="margin-top:6px;color:var(--accent);">Satisfaction: ${t.completion.satisfaction}/10</p>`;
    } else if (cc) { cc.remove(); }
  }

  /* ── Action Buttons (STRICT: only current task, no switch) ── */
  function syncActions() {
    const t = S.tasks[view];
    D.btnStart.style.display = 'none';
    D.btnComplete.style.display = 'none';
    if (!t || S.ended) return;

    // Only the current sequential task can be interacted with
    if (view !== S.currentIdx) return;

    if (t.status === 'active') {
      D.btnComplete.style.display = 'block';
      D.btnComplete.classList.add('btn-full');
    } else if (t.status === 'pending') {
      D.btnStart.style.display = 'block';
      // Block start during break
      if (S.breakStart) {
        D.btnStart.disabled = true;
        D.btnStart.textContent = 'Break in progress...';
      } else {
        D.btnStart.disabled = false;
        D.btnStart.textContent = 'Start Task';
      }
    }
    // completed tasks show nothing — you've moved on
  }

  /* ── Start Task ─────────────────────────── */
  function startTask() {
    const t = S.tasks[S.currentIdx];
    if (!t || t.status !== 'pending') return;

    t.status = 'active';
    S.taskStart = Date.now();

    // Start cycle timer on first task
    if (!S.cycleStart) S.cycleStart = Date.now();

    S.checkAt = Date.now();
    S.checkIgnored = false;
    save();
    renderSlides(); renderDetail(); syncActions();
    scheduleCheck();
  }

  /* ── Complete Task ──────────────────────── */
  function openComplete() {
    D.compExit.style.display = 'block';
    D.compForm.style.display = 'none';
    D.compSummary.value = '';
    D.compRange.value = 5;
    D.compRangeV.textContent = '5';
    D.mComplete.style.display = 'flex';
  }

  function submitComplete() {
    const summary = D.compSummary.value.trim();
    if (!summary) return shake(D.compSummary);
    const sat = +D.compRange.value;
    const t = S.tasks[S.currentIdx];

    t.status = 'completed';
    t.completion = { summary, satisfaction: sat, ts: Date.now() };

    // STRICT: move to next task in order
    const nextIdx = S.currentIdx + 1;

    if (nextIdx < S.tasks.length) {
      // Auto-advance to next task with break
      S.currentIdx = nextIdx;
      S.taskStart = null;
      S.breakStart = Date.now();  // Start 20-min break
      view = nextIdx;
    } else {
      // All tasks done — no break after last task
      S.ended = true;
      S.breakStart = null;
    }

    save();
    hide(D.mComplete);
    renderSlides(); renderDetail(); syncActions();

    if (S.tasks.every(t => t.status === 'completed')) showSuccess();
  }

  /* ════════════════════════════════════════════
     TIMER SYSTEM (TIMESTAMP-BASED)
     ════════════════════════════════════════════ */
  function startTick() {
    if (tickId) clearInterval(tickId);
    tickId = setInterval(tick, 500);
    tick();
  }

  function tick() {
    const now = Date.now();

    // ── Cycle Timer ──
    if (S.cycleStart) {
      const ce = now - S.cycleStart;
      const cr = Math.max(0, CYCLE_MS - ce);
      D.cycleTimer.textContent = fmt(cr);
      D.cycleProg.style.width = `${Math.min(100, ce / CYCLE_MS * 100)}%`;
      if (cr <= 0 && !S.ended) { endCycle(); return; }
    } else {
      D.cycleTimer.textContent = fmt(CYCLE_MS);
      D.cycleProg.style.width = '0%';
    }

    // ── Break Timer ──
    if (S.breakStart) {
      const breakElapsed = now - S.breakStart;
      const breakRem = Math.max(0, BREAK_MS - breakElapsed);
      if (breakRem <= 0) {
        // Break is over — allow starting next task
        S.breakStart = null;
        save();
        beep(2000);
        renderSlides(); syncActions();
      } else {
        // Show break countdown in task timer
        D.taskTimer.textContent = fmt(breakRem);
        D.taskTimer.classList.remove('warn', 'critical');
        D.taskTimer.classList.add('break-timer');
        D.hgSvg.classList.remove('warn', 'critical');
        D.hgSvg.classList.add('break-color');
        updateHourglass(breakRem / BREAK_MS);
        D.sandStr.classList.add('active');
        syncActions(); // keep button text updated
        return; // skip task timer logic
      }
    }

    // ── Task Timer ──
    D.taskTimer.classList.remove('break-timer');
    D.hgSvg.classList.remove('break-color');
    const cur = S.tasks[S.currentIdx];
    if (S.taskStart && cur && cur.status === 'active') {
      const elapsed = now - S.taskStart;
      const rem = Math.max(0, TASK_MS - elapsed);
      D.taskTimer.textContent = fmt(rem);

      // Color warnings
      D.taskTimer.classList.remove('warn', 'critical');
      D.hgSvg.classList.remove('warn', 'critical');
      if (rem < 10 * 60 * 1000) {
        D.taskTimer.classList.add('critical');
        D.hgSvg.classList.add('critical');
      } else if (rem < 30 * 60 * 1000) {
        D.taskTimer.classList.add('warn');
        D.hgSvg.classList.add('warn');
      }

      updateHourglass(rem / TASK_MS);
      D.sandStr.classList.toggle('active', rem > 0);
    } else {
      D.taskTimer.textContent = fmt(TASK_MS);
      D.taskTimer.classList.remove('warn', 'critical');
      D.hgSvg.classList.remove('warn', 'critical');
      D.sandStr.classList.remove('active');
      updateHourglass(1);
    }
  }

  function updateHourglass(frac) {
    const f = Math.max(0, Math.min(1, frac));
    const topH = 31 * f;
    D.sandTop.setAttribute('y', 4 + (31 - topH));
    D.sandTop.setAttribute('height', topH);
    const botH = 31 * (1 - f);
    D.sandBot.setAttribute('y', 66 - botH);
    D.sandBot.setAttribute('height', botH);
  }

  function fmt(ms) {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${p(h)}:${p(m)}:${p(s % 60)}`;
  }
  function p(n) { return n < 10 ? '0' + n : '' + n; }

  /* ════════════════════════════════════════════
     DISCIPLINE CHECK (every 20 minutes)
     ════════════════════════════════════════════ */
  function scheduleCheck() {
    if (checkTimer) clearTimeout(checkTimer);
    const cur = S.tasks[S.currentIdx];
    if (!cur || cur.status !== 'active') return;
    const last = S.checkAt || Date.now();
    const next = last + CHECK_MS;
    const delay = Math.max(0, next - Date.now());
    checkTimer = setTimeout(fireCheck, delay);
  }

  function fireCheck() {
    const cur = S.tasks[S.currentIdx];
    if (!cur || cur.status !== 'active') return;
    beep(BEEP_MS);
    if (S.checkIgnored) {
      D.discTitle.textContent = 'You ignored the check.';
      D.discSub.textContent = 'Are you working or drifting?';
    } else {
      D.discTitle.textContent = 'Are you still working?';
      D.discSub.textContent = '20-minute check-in. Confirm your focus.';
    }
    D.mDiscipline.style.display = 'flex';
    S.checkIgnored = true;
    S.checkAt = Date.now();
    save();
    scheduleCheck();
  }

  function dismissCheck() {
    S.checkIgnored = false;
    S.checkAt = Date.now();
    save();
    hide(D.mDiscipline);
  }

  /* ════════════════════════════════════════════
     END OF CYCLE / TAUNTS
     ════════════════════════════════════════════ */
  function endCycle() {
    S.ended = true; save();
    showEnd();
  }

  function showEnd() {
    if (tickId) clearInterval(tickId);
    if (checkTimer) clearTimeout(checkTimer);

    const inc = S.tasks.filter(t => t.status !== 'completed').length;
    if (inc === 0) { showSuccess(); return; }

    const msgs = {
      1: ['You were close.', 'But close is not discipline. One task remains unfinished. Close is the cruelest distance from done.'],
      2: ['You are avoiding effort.', 'This is not lack of time, this is lack of control. Two tasks left behind. The pattern is becoming clear.'],
      3: ['You planned nothing. You executed nothing.', 'This is wasted time. Three tasks committed, zero completed. The only person you deceived is yourself.'],
    };
    const [h, m] = msgs[inc] || msgs[3];
    D.tauntH.textContent = h;
    D.tauntM.textContent = m;
    D.tauntDismiss.style.display = 'block';
    D.tauntNew.style.display = 'block';
    D.oTaunt.style.display = 'flex';
  }

  function showSuccess() {
    if (tickId) clearInterval(tickId);
    if (checkTimer) clearTimeout(checkTimer);
    D.oSuccess.style.display = 'flex';
  }

  function newCycle() {
    S = blank(); save();
    hide(D.oTaunt); hide(D.oSuccess);
    D.ePhase.style.display = 'none';
    D.cPhase.style.display = 'block';
    D.taskForm.style.display = 'block';
    D.cActions.style.display = 'none';
    D.committed.innerHTML = '';
    syncCounter();
  }

  /* ════════════════════════════════════════════
     IMPORT / EXPORT
     ════════════════════════════════════════════ */
  function doExport() {
    const b = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `tapasya-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doImport(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        S = Object.assign(blank(), JSON.parse(ev.target.result));
        save(); location.reload();
      } catch (_) { alert('Invalid file.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  }

  /* ════════════════════════════════════════════
     UTILITIES
     ════════════════════════════════════════════ */
  function hide(el) { el.style.display = 'none'; }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function shake(el) {
    el.classList.remove('shaking');
    void el.offsetHeight;
    el.classList.add('shaking');
    el.focus();
    el.addEventListener('animationend', () => el.classList.remove('shaking'), { once: true });
  }

  /* ── GO ──────────────────────────────────── */
  boot();
})();
