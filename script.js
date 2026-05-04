/* ============================================
   TAPASYA — DISCIPLINE SYSTEM
   Vanilla JS · localStorage · Timestamp Timers
   ============================================ */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────
  const STORAGE_KEY = 'tapasyaState';
  const TASK_DURATION_MS = 2 * 60 * 60 * 1000;       // 2 hours
  const MAX_CYCLE_MS = 6 * 60 * 60 * 1000;            // 6 hours
  const DISCIPLINE_INTERVAL_MS = 20 * 60 * 1000;      // 20 minutes
  const BEEP_DURATION_MS = 5000;
  const MAX_TASKS = 3;

  // ── Audio context for beep ─────────────────
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playBeep(durationMs) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
      // Audio not available — fail silently
    }
  }

  // ── Default State ──────────────────────────
  function defaultState() {
    return {
      tasks: [],
      currentTaskIndex: -1,
      cycleStartTime: null,
      taskStartTime: null,
      taskPausedAccum: {},    // taskIndex → accumulated paused ms
      taskPausedAt: null,     // timestamp when current task was paused (switched away)
      logs: [],
      isLocked: false,
      cycleEnded: false,
      disciplineLastCheck: null,
      disciplineIgnored: false,
      completions: {}         // taskIndex → { summary, satisfaction }
    };
  }

  // ── State persistence ──────────────────────
  let state = defaultState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        return true;
      }
    } catch (e) { /* corrupt data — reset */ }
    state = defaultState();
    return false;
  }

  function resetState() {
    state = defaultState();
    saveState();
  }

  // ── DOM refs ───────────────────────────────
  const $ = (id) => document.getElementById(id);

  const dom = {
    // Phases
    creationPhase: $('creation-phase'),
    executionPhase: $('execution-phase'),

    // Creation
    taskCountLabel: $('task-count-label'),
    counterFill: $('counter-fill'),
    taskForm: $('task-form'),
    taskTitle: $('task-title'),
    taskMotivation: $('task-motivation'),
    subtaskList: $('subtask-list'),
    addSubtaskBtn: $('add-subtask-btn'),
    saveTaskBtn: $('save-task-btn'),
    committedTasks: $('committed-tasks'),
    creationActions: $('creation-actions'),
    beginCycleBtn: $('begin-cycle-btn'),

    // Execution
    taskTimer: $('task-timer'),
    cycleTimer: $('cycle-timer'),
    cycleProgress: $('cycle-progress'),
    cardsTrack: $('cards-track'),
    cardPrev: $('card-prev'),
    cardNext: $('card-next'),
    cardDots: $('card-dots'),
    taskDetail: $('task-detail'),
    detailMotivation: $('detail-motivation'),
    detailSubtasks: $('detail-subtasks'),
    detailLog: $('detail-log'),
    detailLogEntries: $('detail-log-entries'),
    actionBar: $('action-bar'),
    actionStart: $('action-start'),
    actionComplete: $('action-complete'),
    actionSwitch: $('action-switch'),

    // Hourglass
    hourglassSvg: $('hourglass-svg'),
    sandTop: $('sand-top'),
    sandBottom: $('sand-bottom'),
    sandStream: $('sand-stream'),

    // Modals
    modalAbandon: $('modal-abandon'),
    abandonReason: $('abandon-reason'),
    abandonCancel: $('abandon-cancel'),
    abandonConfirm: $('abandon-confirm'),

    modalComplete: $('modal-complete'),
    completeStepExit: $('complete-step-exit'),
    completeStepForm: $('complete-step-form'),
    exitNo: $('exit-no'),
    exitYes: $('exit-yes'),
    completeSummary: $('complete-summary'),
    completeSatisfaction: $('complete-satisfaction'),
    satisfactionValue: $('satisfaction-value'),
    completeSubmit: $('complete-submit'),

    modalDiscipline: $('modal-discipline'),
    disciplineTitle: $('discipline-title'),
    disciplineSubtitle: $('discipline-subtitle'),
    disciplineConfirm: $('discipline-confirm'),

    // Taunts
    overlayTaunt: $('overlay-taunt'),
    tauntHeading: $('taunt-heading'),
    tauntMessage: $('taunt-message'),
    tauntDismiss: $('taunt-dismiss'),
    tauntNewCycle: $('taunt-new-cycle'),

    // Success
    overlaySuccess: $('overlay-success'),
    successNewCycle: $('success-new-cycle'),

    // IO
    importBtn: $('import-btn'),
    exportBtn: $('export-btn'),
    importFile: $('import-file'),
    exportBtnExec: $('export-btn-exec'),
  };

  // ── View index for sliding cards ───────────
  let viewIndex = 0;

  // ── Timer interval ─────────────────────────
  let timerInterval = null;
  let disciplineTimeout = null;

  // ════════════════════════════════════════════
  // INITIALIZATION
  // ════════════════════════════════════════════

  function init() {
    loadState();
    bindEvents();

    if (state.isLocked && state.tasks.length > 0) {
      showExecution();
    } else if (state.tasks.length > 0) {
      renderCommittedTasks();
      updateCreationCounter();
      if (state.tasks.length >= MAX_TASKS) {
        dom.taskForm.style.display = 'none';
      }
    }
  }

  // ════════════════════════════════════════════
  // EVENT BINDING
  // ════════════════════════════════════════════

  function bindEvents() {
    // Subtasks
    dom.addSubtaskBtn.addEventListener('click', addSubtaskInput);
    dom.saveTaskBtn.addEventListener('click', saveTask);
    dom.beginCycleBtn.addEventListener('click', beginCycle);

    // Card nav
    dom.cardPrev.addEventListener('click', () => navigateCard(-1));
    dom.cardNext.addEventListener('click', () => navigateCard(1));

    // Actions
    dom.actionStart.addEventListener('click', startTask);
    dom.actionComplete.addEventListener('click', showCompleteModal);
    dom.actionSwitch.addEventListener('click', showAbandonModal);

    // Abandon modal
    dom.abandonCancel.addEventListener('click', () => hideModal(dom.modalAbandon));
    dom.abandonConfirm.addEventListener('click', confirmAbandon);

    // Complete modal
    dom.exitNo.addEventListener('click', () => hideModal(dom.modalComplete));
    dom.exitYes.addEventListener('click', () => {
      dom.completeStepExit.style.display = 'none';
      dom.completeStepForm.style.display = 'block';
    });
    dom.completeSatisfaction.addEventListener('input', () => {
      dom.satisfactionValue.textContent = dom.completeSatisfaction.value;
    });
    dom.completeSubmit.addEventListener('click', submitCompletion);

    // Discipline modal
    dom.disciplineConfirm.addEventListener('click', dismissDisciplineCheck);

    // Taunts
    dom.tauntDismiss.addEventListener('click', () => {
      dom.overlayTaunt.style.display = 'none';
    });
    dom.tauntNewCycle.addEventListener('click', startNewCycle);
    dom.successNewCycle.addEventListener('click', startNewCycle);

    // IO
    dom.importBtn.addEventListener('click', () => dom.importFile.click());
    dom.importFile.addEventListener('change', importState);
    dom.exportBtn.addEventListener('click', exportState);
    if (dom.exportBtnExec) dom.exportBtnExec.addEventListener('click', exportState);

    // Touch swipe for cards
    let touchStartX = 0;
    const track = dom.cardsTrack;
    track.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    track.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        navigateCard(dx > 0 ? -1 : 1);
      }
    });
  }

  // ════════════════════════════════════════════
  // CREATION PHASE
  // ════════════════════════════════════════════

  function addSubtaskInput() {
    const item = document.createElement('div');
    item.className = 'subtask-item pop-in';
    item.innerHTML = `
      <input type="text" placeholder="Subtask..." maxlength="120" autocomplete="off" />
      <button type="button" class="subtask-remove" aria-label="Remove subtask">×</button>
    `;
    item.querySelector('.subtask-remove').addEventListener('click', () => {
      item.remove();
    });
    dom.subtaskList.appendChild(item);
    item.querySelector('input').focus();
  }

  function saveTask() {
    const title = dom.taskTitle.value.trim();
    const motivation = dom.taskMotivation.value.trim();
    const subtaskInputs = dom.subtaskList.querySelectorAll('input');
    const subtasks = [];
    subtaskInputs.forEach(inp => {
      const val = inp.value.trim();
      if (val) subtasks.push({ text: val, done: false });
    });

    // Validation
    if (!title) return shakeElement(dom.taskTitle);
    if (!motivation) return shakeElement(dom.taskMotivation);
    if (subtasks.length === 0) {
      addSubtaskInput();
      return shakeElement(dom.addSubtaskBtn);
    }

    if (state.tasks.length >= MAX_TASKS) return;

    state.tasks.push({
      title,
      motivation,
      subtasks,
      status: 'pending',       // pending | active | completed | abandoned
      switchLogs: [],
      completion: null
    });
    saveState();

    // Reset form
    dom.taskTitle.value = '';
    dom.taskMotivation.value = '';
    dom.subtaskList.innerHTML = '';

    renderCommittedTasks();
    updateCreationCounter();

    if (state.tasks.length >= MAX_TASKS) {
      dom.taskForm.style.display = 'none';
    }
  }

  function updateCreationCounter() {
    const count = state.tasks.length;
    dom.taskCountLabel.textContent = `${count} / ${MAX_TASKS} tasks`;
    dom.counterFill.style.width = `${(count / MAX_TASKS) * 100}%`;

    if (count >= 1) {
      dom.creationActions.style.display = 'block';
    } else {
      dom.creationActions.style.display = 'none';
    }
  }

  function renderCommittedTasks() {
    dom.committedTasks.innerHTML = '';
    state.tasks.forEach((task, i) => {
      const card = document.createElement('div');
      card.className = 'committed-card pop-in';
      card.draggable = true;
      card.dataset.index = i;
      card.innerHTML = `
        <div class="card-num">${i + 1}</div>
        <div class="card-info">
          <div class="card-title">${esc(task.title)}</div>
          <div class="card-meta">${task.subtasks.length} subtask${task.subtasks.length > 1 ? 's' : ''} · 2 hours</div>
        </div>
        <button class="card-delete" aria-label="Delete task" data-idx="${i}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      // Delete
      card.querySelector('.card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(i);
      });

      // Drag & drop reordering
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', i);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', (e) => e.preventDefault());
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = i;
        if (from !== to) reorderTasks(from, to);
      });

      dom.committedTasks.appendChild(card);
    });
  }

  function deleteTask(index) {
    if (state.isLocked) return;
    state.tasks.splice(index, 1);
    saveState();
    renderCommittedTasks();
    updateCreationCounter();
    if (state.tasks.length < MAX_TASKS) {
      dom.taskForm.style.display = 'block';
    }
  }

  function reorderTasks(from, to) {
    if (state.isLocked) return;
    const [moved] = state.tasks.splice(from, 1);
    state.tasks.splice(to, 0, moved);
    saveState();
    renderCommittedTasks();
  }

  function beginCycle() {
    if (state.tasks.length === 0) return;

    state.isLocked = true;
    state.currentTaskIndex = 0;
    state.cycleStartTime = null; // will be set when first task starts
    state.cycleEnded = false;
    saveState();

    showExecution();
  }

  // ════════════════════════════════════════════
  // EXECUTION PHASE
  // ════════════════════════════════════════════

  function showExecution() {
    dom.creationPhase.style.display = 'none';
    dom.executionPhase.style.display = 'block';
    viewIndex = state.currentTaskIndex >= 0 ? state.currentTaskIndex : 0;
    renderCards();
    renderDetail();
    updateActionButtons();
    startTimerLoop();
    scheduleDisciplineCheck();

    // Check if cycle has already ended (page refresh after expiry)
    if (state.cycleEnded) {
      showEndOfCycle();
      return;
    }

    // Check if cycle time expired
    if (state.cycleStartTime) {
      const elapsed = Date.now() - state.cycleStartTime;
      if (elapsed >= MAX_CYCLE_MS) {
        endCycle();
        return;
      }
    }
  }

  // ── Cards ──────────────────────────────────
  function renderCards() {
    dom.cardsTrack.innerHTML = '';
    dom.cardDots.innerHTML = '';

    state.tasks.forEach((task, i) => {
      // Card
      const card = document.createElement('div');
      card.className = 'task-card';
      const statusClass = task.status === 'active' ? 'active' :
                          task.status === 'completed' ? 'completed' :
                          task.status === 'abandoned' ? 'abandoned' : '';
      const statusLabel = task.status === 'active' ? 'ACTIVE' :
                          task.status === 'completed' ? 'COMPLETED' :
                          task.status === 'abandoned' ? 'SWITCHED' :
                          'PENDING';
      const statusCls = task.status === 'active' ? 'status-active' :
                        task.status === 'completed' ? 'status-completed' :
                        task.status === 'abandoned' ? 'status-abandoned' : '';

      const completedSubs = task.subtasks.filter(s => s.done).length;
      card.innerHTML = `
        <div class="task-card-inner ${statusClass}">
          <span class="card-status ${statusCls}">${statusLabel}</span>
          <div class="card-task-title">${esc(task.title)}</div>
          <span class="card-task-progress">${completedSubs}/${task.subtasks.length} subtasks</span>
        </div>
      `;
      dom.cardsTrack.appendChild(card);

      // Dot
      const dot = document.createElement('div');
      dot.className = 'card-dot' + (i === viewIndex ? ' active' : '');
      dot.addEventListener('click', () => { viewIndex = i; slideToView(); renderDetail(); updateActionButtons(); });
      dom.cardDots.appendChild(dot);
    });

    slideToView();
  }

  function slideToView() {
    dom.cardsTrack.style.transform = `translateX(-${viewIndex * 100}%)`;
    // Update dots
    dom.cardDots.querySelectorAll('.card-dot').forEach((d, i) => {
      d.classList.toggle('active', i === viewIndex);
    });
  }

  function navigateCard(dir) {
    const next = viewIndex + dir;
    if (next < 0 || next >= state.tasks.length) return;
    viewIndex = next;
    slideToView();
    renderDetail();
    updateActionButtons();
  }

  // ── Detail Panel ───────────────────────────
  function renderDetail() {
    const task = state.tasks[viewIndex];
    if (!task) return;

    dom.detailMotivation.textContent = task.motivation;

    dom.detailSubtasks.innerHTML = '';
    task.subtasks.forEach((sub, si) => {
      const li = document.createElement('li');
      li.className = 'detail-subtask';
      const isCurrentTask = viewIndex === state.currentTaskIndex && task.status === 'active';
      li.innerHTML = `
        <div class="subtask-check ${sub.done ? 'checked' : ''}" data-si="${si}" ${isCurrentTask ? '' : 'style="pointer-events:none;opacity:0.4"'}>✓</div>
        <span class="subtask-text ${sub.done ? 'done' : ''}">${esc(sub.text)}</span>
      `;
      if (isCurrentTask) {
        li.querySelector('.subtask-check').addEventListener('click', () => {
          sub.done = !sub.done;
          saveState();
          renderDetail();
          renderCards();
        });
      }
      dom.detailSubtasks.appendChild(li);
    });

    // Switch logs
    if (task.switchLogs && task.switchLogs.length > 0) {
      dom.detailLog.style.display = 'block';
      dom.detailLogEntries.innerHTML = '';
      task.switchLogs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
          <div class="log-entry-time">${new Date(log.timestamp).toLocaleTimeString()}</div>
          <div class="log-entry-text">${esc(log.reason)}</div>
        `;
        dom.detailLogEntries.appendChild(entry);
      });
    } else {
      dom.detailLog.style.display = 'none';
    }

    // Show completion info if completed
    if (task.completion) {
      let compSection = dom.taskDetail.querySelector('.completion-section');
      if (!compSection) {
        compSection = document.createElement('div');
        compSection.className = 'detail-section completion-section';
        dom.taskDetail.appendChild(compSection);
      }
      compSection.innerHTML = `
        <h3 class="detail-heading">Completion</h3>
        <p class="detail-text">${esc(task.completion.summary)}</p>
        <p class="detail-text" style="margin-top:8px;color:var(--accent);">Satisfaction: ${task.completion.satisfaction}/10</p>
      `;
    } else {
      const compSection = dom.taskDetail.querySelector('.completion-section');
      if (compSection) compSection.remove();
    }
  }

  // ── Action Buttons ─────────────────────────
  function updateActionButtons() {
    const task = state.tasks[viewIndex];
    if (!task) return;

    dom.actionStart.style.display = 'none';
    dom.actionComplete.style.display = 'none';
    dom.actionSwitch.style.display = 'none';

    // If cycle ended, hide all
    if (state.cycleEnded) return;

    if (viewIndex === state.currentTaskIndex) {
      if (task.status === 'pending') {
        // Check if tasks before this are done
        const canStart = canStartTask(viewIndex);
        dom.actionStart.style.display = 'block';
        dom.actionStart.disabled = !canStart;
        if (!canStart) {
          dom.actionStart.textContent = 'Complete previous tasks first';
        } else {
          dom.actionStart.textContent = 'Start Task';
        }
      } else if (task.status === 'active') {
        dom.actionComplete.style.display = 'block';
        if (state.tasks.length > 1) {
          dom.actionSwitch.style.display = 'block';
        }
      }
    } else if (task.status === 'pending') {
      const canStart = canStartTask(viewIndex);
      dom.actionStart.style.display = 'block';
      dom.actionStart.disabled = !canStart;
      if (!canStart) {
        dom.actionStart.textContent = 'Complete previous tasks first';
      } else {
        dom.actionStart.textContent = 'Start Task';
      }
    }
    // If completed/abandoned, show nothing
  }

  function canStartTask(index) {
    // Tasks must be completed sequentially. Can only start task i if all tasks before i are completed.
    for (let i = 0; i < index; i++) {
      if (state.tasks[i].status !== 'completed') return false;
    }
    // Also, no other task should be active
    const activeIdx = state.tasks.findIndex(t => t.status === 'active');
    if (activeIdx >= 0 && activeIdx !== index) return false;
    return true;
  }

  // ── Start Task ─────────────────────────────
  function startTask() {
    const task = state.tasks[viewIndex];
    if (!task || task.status !== 'pending') return;
    if (!canStartTask(viewIndex)) return;

    // If there's an active task (switching scenario), don't allow direct start
    const activeIdx = state.tasks.findIndex(t => t.status === 'active');
    if (activeIdx >= 0 && activeIdx !== viewIndex) return;

    task.status = 'active';
    state.currentTaskIndex = viewIndex;
    state.taskStartTime = Date.now();

    if (!state.taskPausedAccum) state.taskPausedAccum = {};
    state.taskPausedAccum[viewIndex] = 0;
    state.taskPausedAt = null;

    // Start cycle timer on first task
    if (!state.cycleStartTime) {
      state.cycleStartTime = Date.now();
    }

    state.disciplineLastCheck = Date.now();
    state.disciplineIgnored = false;

    saveState();
    renderCards();
    renderDetail();
    updateActionButtons();
    scheduleDisciplineCheck();
  }

  // ── Switch / Abandon ───────────────────────
  function showAbandonModal() {
    dom.abandonReason.value = '';
    dom.modalAbandon.style.display = 'flex';
    dom.abandonReason.focus();
  }

  function confirmAbandon() {
    const reason = dom.abandonReason.value.trim();
    if (!reason) return shakeElement(dom.abandonReason);

    const currentTask = state.tasks[state.currentTaskIndex];

    // Log the switch
    currentTask.switchLogs.push({
      reason,
      timestamp: Date.now()
    });

    // Pause timer for current task
    state.taskPausedAt = Date.now();

    // Mark current as abandoned (switched away)
    currentTask.status = 'abandoned';

    // Find next pending task
    let nextIdx = -1;
    for (let i = 0; i < state.tasks.length; i++) {
      if (i !== state.currentTaskIndex && state.tasks[i].status === 'pending') {
        nextIdx = i;
        break;
      }
    }

    if (nextIdx >= 0) {
      state.currentTaskIndex = nextIdx;
      state.tasks[nextIdx].status = 'active';
      state.taskStartTime = Date.now();
      if (!state.taskPausedAccum) state.taskPausedAccum = {};
      state.taskPausedAccum[nextIdx] = 0;
      state.taskPausedAt = null;
      viewIndex = nextIdx;
    } else {
      // No more pending tasks — check if all completed or cycle ends
      state.taskStartTime = null;
    }

    saveState();
    hideModal(dom.modalAbandon);
    renderCards();
    renderDetail();
    updateActionButtons();
  }

  // ── Complete Task ──────────────────────────
  function showCompleteModal() {
    dom.completeStepExit.style.display = 'block';
    dom.completeStepForm.style.display = 'none';
    dom.completeSummary.value = '';
    dom.completeSatisfaction.value = 5;
    dom.satisfactionValue.textContent = '5';
    dom.modalComplete.style.display = 'flex';
  }

  function submitCompletion() {
    const summary = dom.completeSummary.value.trim();
    if (!summary) return shakeElement(dom.completeSummary);

    const satisfaction = parseInt(dom.completeSatisfaction.value);
    const task = state.tasks[state.currentTaskIndex];

    task.status = 'completed';
    task.completion = { summary, satisfaction, timestamp: Date.now() };

    // Move to next task
    let nextIdx = -1;
    for (let i = state.currentTaskIndex + 1; i < state.tasks.length; i++) {
      if (state.tasks[i].status === 'pending' || state.tasks[i].status === 'abandoned') {
        nextIdx = i;
        break;
      }
    }

    if (nextIdx >= 0) {
      state.currentTaskIndex = nextIdx;
      state.taskStartTime = null; // will start when user clicks Start
      viewIndex = nextIdx;
    } else {
      // Check if all tasks completed
      const allDone = state.tasks.every(t => t.status === 'completed');
      if (allDone) {
        state.cycleEnded = true;
      } else {
        // Some abandoned, not all complete
        state.currentTaskIndex = state.tasks.findIndex(t => t.status !== 'completed');
        if (state.currentTaskIndex < 0) state.cycleEnded = true;
        viewIndex = state.currentTaskIndex >= 0 ? state.currentTaskIndex : 0;
      }
    }

    saveState();
    hideModal(dom.modalComplete);
    renderCards();
    renderDetail();
    updateActionButtons();

    if (state.tasks.every(t => t.status === 'completed')) {
      showSuccess();
    }
  }

  // ════════════════════════════════════════════
  // TIMER SYSTEM (TIMESTAMP-BASED)
  // ════════════════════════════════════════════

  function startTimerLoop() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimers, 500);
    updateTimers();
  }

  function updateTimers() {
    const now = Date.now();

    // ── Cycle timer ──
    if (state.cycleStartTime) {
      const cycleElapsed = now - state.cycleStartTime;
      const cycleRemaining = Math.max(0, MAX_CYCLE_MS - cycleElapsed);
      dom.cycleTimer.textContent = formatTime(cycleRemaining);

      const progress = Math.min(100, (cycleElapsed / MAX_CYCLE_MS) * 100);
      dom.cycleProgress.style.width = `${progress}%`;

      // Cycle expired
      if (cycleRemaining <= 0 && !state.cycleEnded) {
        endCycle();
        return;
      }
    } else {
      dom.cycleTimer.textContent = formatTime(MAX_CYCLE_MS);
      dom.cycleProgress.style.width = '0%';
    }

    // ── Task timer ──
    if (state.taskStartTime && state.currentTaskIndex >= 0) {
      const task = state.tasks[state.currentTaskIndex];
      if (task && task.status === 'active') {
        const pausedMs = (state.taskPausedAccum && state.taskPausedAccum[state.currentTaskIndex]) || 0;
        let taskElapsed = now - state.taskStartTime - pausedMs;
        if (state.taskPausedAt) {
          taskElapsed -= (now - state.taskPausedAt);
        }
        const taskRemaining = Math.max(0, TASK_DURATION_MS - taskElapsed);
        dom.taskTimer.textContent = formatTime(taskRemaining);

        // Color classes
        const thirtyMin = 30 * 60 * 1000;
        const tenMin = 10 * 60 * 1000;

        dom.taskTimer.classList.remove('warn', 'critical');
        dom.hourglassSvg.classList.remove('warn', 'critical');

        if (taskRemaining < tenMin) {
          dom.taskTimer.classList.add('critical');
          dom.hourglassSvg.classList.add('critical');
        } else if (taskRemaining < thirtyMin) {
          dom.taskTimer.classList.add('warn');
          dom.hourglassSvg.classList.add('warn');
        }

        // Update hourglass sand
        updateHourglass(taskRemaining / TASK_DURATION_MS);

        // Show sand stream when active
        dom.sandStream.classList.toggle('active', taskRemaining > 0);

        // Task time expired
        if (taskRemaining <= 0) {
          // Auto-expire — force completion
          dom.sandStream.classList.remove('active');
        }
      } else {
        dom.taskTimer.textContent = formatTime(TASK_DURATION_MS);
        dom.sandStream.classList.remove('active');
        updateHourglass(1);
      }
    } else {
      dom.taskTimer.textContent = formatTime(TASK_DURATION_MS);
      dom.sandStream.classList.remove('active');
      updateHourglass(1);
    }
  }

  function updateHourglass(fraction) {
    // fraction: 1 = full, 0 = empty
    const clamped = Math.max(0, Math.min(1, fraction));

    // Top sand: shrinks from full height
    const topFullHeight = 44;
    const topH = topFullHeight * clamped;
    const topY = 6 + (topFullHeight - topH);
    dom.sandTop.setAttribute('y', topY);
    dom.sandTop.setAttribute('height', topH);

    // Bottom sand: grows
    const bottomFullHeight = 44;
    const bottomH = bottomFullHeight * (1 - clamped);
    const bottomY = 94 - bottomH;
    dom.sandBottom.setAttribute('y', bottomY);
    dom.sandBottom.setAttribute('height', bottomH);
  }

  function formatTime(ms) {
    if (ms <= 0) return '00:00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // ════════════════════════════════════════════
  // DISCIPLINE CHECK (every 20 min)
  // ════════════════════════════════════════════

  function scheduleDisciplineCheck() {
    if (disciplineTimeout) clearTimeout(disciplineTimeout);

    // Only schedule if there's an active task
    const activeTask = state.tasks.find(t => t.status === 'active');
    if (!activeTask) return;

    const lastCheck = state.disciplineLastCheck || Date.now();
    const nextCheck = lastCheck + DISCIPLINE_INTERVAL_MS;
    const delay = Math.max(0, nextCheck - Date.now());

    disciplineTimeout = setTimeout(() => {
      triggerDisciplineCheck();
    }, delay);
  }

  function triggerDisciplineCheck() {
    const activeTask = state.tasks.find(t => t.status === 'active');
    if (!activeTask) return;

    playBeep(BEEP_DURATION_MS);

    if (state.disciplineIgnored) {
      dom.disciplineTitle.textContent = 'You ignored the check.';
      dom.disciplineSubtitle.textContent = 'Are you working or drifting?';
    } else {
      dom.disciplineTitle.textContent = 'Are you still working?';
      dom.disciplineSubtitle.textContent = '20-minute check-in. Confirm your focus.';
    }

    dom.modalDiscipline.style.display = 'flex';
    state.disciplineIgnored = true;
    saveState();

    // Schedule next check even if this one is ignored
    state.disciplineLastCheck = Date.now();
    scheduleDisciplineCheck();
  }

  function dismissDisciplineCheck() {
    state.disciplineIgnored = false;
    state.disciplineLastCheck = Date.now();
    saveState();
    hideModal(dom.modalDiscipline);
  }

  // ════════════════════════════════════════════
  // END OF CYCLE / TAUNTS
  // ════════════════════════════════════════════

  function endCycle() {
    state.cycleEnded = true;
    saveState();
    showEndOfCycle();
  }

  function showEndOfCycle() {
    if (timerInterval) clearInterval(timerInterval);
    if (disciplineTimeout) clearTimeout(disciplineTimeout);

    const incomplete = state.tasks.filter(t => t.status !== 'completed').length;

    if (incomplete === 0) {
      showSuccess();
      return;
    }

    let heading = '';
    let message = '';

    if (incomplete === 1) {
      heading = 'You were close.';
      message = 'But close is not discipline. One task remains unfinished. Close is the cruelest distance from done.';
    } else if (incomplete === 2) {
      heading = 'You are avoiding effort.';
      message = 'This is not lack of time, this is lack of control. Two tasks left behind. The pattern is becoming clear.';
    } else {
      heading = 'You planned nothing. You executed nothing.';
      message = 'This is wasted time. Three tasks committed, zero completed. The only person you deceived is yourself.';
    }

    dom.tauntHeading.textContent = heading;
    dom.tauntMessage.textContent = message;
    dom.tauntDismiss.style.display = 'block';
    dom.tauntNewCycle.style.display = 'block';
    dom.overlayTaunt.style.display = 'flex';
  }

  function showSuccess() {
    if (timerInterval) clearInterval(timerInterval);
    if (disciplineTimeout) clearTimeout(disciplineTimeout);
    dom.overlaySuccess.style.display = 'flex';
  }

  function startNewCycle() {
    resetState();
    dom.overlayTaunt.style.display = 'none';
    dom.overlaySuccess.style.display = 'none';
    dom.executionPhase.style.display = 'none';
    dom.creationPhase.style.display = 'block';
    dom.taskForm.style.display = 'block';
    dom.creationActions.style.display = 'none';
    dom.committedTasks.innerHTML = '';
    updateCreationCounter();
  }

  // ════════════════════════════════════════════
  // IMPORT / EXPORT
  // ════════════════════════════════════════════

  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tapasya-state-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        state = Object.assign(defaultState(), imported);
        saveState();
        location.reload();
      } catch (err) {
        alert('Invalid state file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════

  function hideModal(modal) {
    modal.style.display = 'none';
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function shakeElement(el) {
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = 'shake-input 0.4s ease';
    el.focus();
  }

  // Add shake animation dynamically
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake-input {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);

  // ── BOOT ───────────────────────────────────
  init();

})();
