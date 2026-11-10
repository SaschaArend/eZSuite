document.addEventListener('DOMContentLoaded', async () => {

  const btnLibrary = document.getElementById('btnLibrary');
  const copyOnClick = document.getElementById('copyOnClick');
  const smartCrop = document.getElementById('smartCrop');
  const devMode = document.getElementById('devMode');
  const showRPA = document.getElementById('showRPA');

  const toggleSessionBtn = document.getElementById('toggleSession');
  const pauseSessionBtn = document.getElementById('pauseSession');
  const sessionStatus = document.getElementById('sessionStatus');
  const sessionCount = document.getElementById('sessionCount');
  const sessionControls = document.getElementById('sessionControls');
  const openEditorBtn = document.getElementById('openEditor');

  document.addEventListener('keydown', async (e) => {
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    const key = e.key.toLowerCase();
    console.log(`[Hotkey] Ctrl+${key.toUpperCase()} gedrückt`);

    try {
      switch (key) {
        case 's':
          await handleQuickSave();
          break;
        case 'c':
          await handleCopyScreenshot();
          showHotkeyFeedback('📋 Screenshot kopiert!');
          break;
        case 'd':
          await handleDownload();
          showHotkeyFeedback('💾 Download gestartet!');
          break;
        default:
          console.log(`[Hotkey] Unbekannter Hotkey: Ctrl+${key.toUpperCase()}`);
      }
    } catch (error) {
      console.error('[Hotkey] Fehler bei Hotkey-Ausführung:', error);
      showHotkeyFeedback('❌ Fehler!', true);
    }
  });

  async function handleQuickSave() {
    showHotkeyFeedback('⚡ Quick-Save aktiviert', false, 1500);
  }

  async function handleCopyScreenshot() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'copyScreenshot' });
    }
  }

  async function handleDownload() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'triggerDownload' });
    }
  }

  function showHotkeyFeedback(message, isError = false, duration = 3000) {
    let feedback = document.getElementById('hotkeyFeedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'hotkeyFeedback';
      document.body.appendChild(feedback);
    }
    feedback.textContent = message;
    feedback.style.background = isError ? '#ef4444' : '#10b981';
    feedback.style.opacity = '1';
    feedback.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
      feedback.style.opacity = '0';
      feedback.style.transform = 'translateX(-50%) translateY(-10px)';
    }, duration);
  }

  const cfg = await chrome.storage.sync.get(["recording", "copyOnClick", "smartCrop", "devMode", "showRPA"]);

  if (cfg.recording !== false) {
    chrome.storage.sync.set({ recording: false });
  }

  copyOnClick.checked = !!cfg.copyOnClick;
  smartCrop.checked = !!cfg.smartCrop;
  devMode.checked = !!cfg.devMode;
  showRPA.checked = !!cfg.showRPA;

  copyOnClick.addEventListener('change', () => {
    chrome.storage.sync.set({ copyOnClick: copyOnClick.checked });
  });

  devMode.addEventListener('change', () => {
    chrome.storage.sync.set({ devMode: devMode.checked });
  });

  smartCrop.addEventListener('change', () => {
    chrome.storage.sync.set({ smartCrop: smartCrop.checked });
  });

  showRPA.addEventListener('change', () => {
    chrome.storage.sync.set({ showRPA: showRPA.checked });
  });

  async function updateSessionUI() {
    const data = await chrome.storage.local.get(['sessionRecordingState', 'activeSession']);
    const session = data.activeSession;
    const state = data.sessionRecordingState || (session ? {
      isActive: !!session.isActive,
      isPaused: !!session.isPaused,
      count: session.steps ? session.steps.length : 0
    } : null);

    sessionControls.style.display = 'block';

    if (state && state.isActive) {
      if (state.isPaused) {
        sessionStatus.textContent = 'Pausiert';
        sessionStatus.style.color = '#f59e0b';
        pauseSessionBtn.textContent = 'Fortsetzen';
      } else {
        sessionStatus.textContent = 'Aktiv';
        sessionStatus.style.color = '#10b981';
        pauseSessionBtn.textContent = 'Pause';
      }
      const stepCount = session?.steps ? session.steps.length : (state.count || 0);
      sessionCount.textContent = `${stepCount} Schritte`;
      toggleSessionBtn.textContent = 'Beenden';
      toggleSessionBtn.style.background = '#ef4444';
      pauseSessionBtn.style.display = 'block';
    } else {
      sessionStatus.textContent = 'Inaktiv';
      sessionStatus.style.color = '';
      sessionCount.textContent = '0 Schritte';
      toggleSessionBtn.textContent = 'Start';
      toggleSessionBtn.style.background = '';
      pauseSessionBtn.style.display = 'none';
    }
  }

  toggleSessionBtn.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('activeSession');
    let session = data.activeSession;

    if (session && session.isActive) {

      session.isActive = false;
      await chrome.storage.local.set({
        activeSession: session,
        sessionRecordingState: {
          isActive: false,
          isPaused: false,
          count: session.steps ? session.steps.length : 0
        }
      });
      chrome.tabs.create({ url: 'ui/editor.html' });
    } else {

      session = {
        id: Date.now().toString(),
        isActive: true,
        isPaused: false,
        startTime: new Date().toISOString(),
        steps: []
      };
      await chrome.storage.local.set({
        activeSession: session,
        sessionRecordingState: {
          isActive: true,
          isPaused: false,
          count: 0
        }
      });

      chrome.runtime.sendMessage({ type: 'cleanupOrphanedImages' }).catch(() => {});
    }
    updateSessionUI();
  });

  pauseSessionBtn.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('activeSession');
    let session = data.activeSession;

    if (session && session.isActive) {
      session.isPaused = !session.isPaused;
      await chrome.storage.local.set({
        activeSession: session,
        sessionRecordingState: {
          isActive: true,
          isPaused: !!session.isPaused,
          count: session.steps ? session.steps.length : 0
        }
      });
      updateSessionUI();
    }
  });

  openEditorBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'ui/editor.html' });
  });

  if (btnLibrary) {
    btnLibrary.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/library.html') });
    });
  }

  updateSessionUI();

  const carouselContainer = document.getElementById('carouselContainer');
  const carouselTrack = document.getElementById('carouselTrack');
  const carouselDots = document.getElementById('carouselDots');
  const allLogoItems = Array.from(document.querySelectorAll('.logo-item'));

  const viewNotes = document.getElementById('view-notes');
  const viewTracker = document.getElementById('view-tracker');
  const viewClip = document.getElementById('view-clip');
  const viewSnippetz = document.getElementById('view-snippetz');
  const btnOpenClipApp = document.getElementById('btnOpenClipApp');
  const btnOpenSnippetzApp = document.getElementById('btnOpenSnippetzApp');
  const popupSnippetzList = document.getElementById('popupSnippetzList');
  const snippetzCountBadge = document.getElementById('snippetzCountBadge');

  const quickActionsGrid = document.getElementById('quickActionsGrid');
  const btnConfigureActions = document.getElementById('btnConfigureActions');
  const actionsModal = document.getElementById('actionsModal');
  const actionsModalContent = document.getElementById('actionsModalContent');
  const btnCloseActionsModal = document.getElementById('btnCloseActionsModal');
  const actionsChecklist = document.getElementById('actionsChecklist');
  const actionsLimitText = document.getElementById('actionsLimitText');

  async function loadSuiteConfig() {
    const defaultCfg = { notes: true, tracker: true, clip: true, snippetz: true };
    try {
      const resp = await fetch(chrome.runtime.getURL('config.json'), { cache: 'no-store' });
      if (!resp.ok) return defaultCfg;
      const raw = await resp.json();

      const src = (raw && typeof raw.enabledTools === 'object' && !Array.isArray(raw.enabledTools))
        ? raw.enabledTools
        : raw;

      if (raw && Array.isArray(raw.enabledTools)) {
        const lower = raw.enabledTools.map(x => String(x).toLowerCase());
        return {
          notes: lower.includes('eznotes') || lower.includes('notes'),
          tracker: lower.includes('eztimetracker') || lower.includes('tracker'),
          clip: lower.includes('ezclip') || lower.includes('clip'),
          snippetz: lower.includes('ezsnippetz') || lower.includes('snippetz')
        };
      }

      const resolved = {
        notes: (src.eZNotes ?? src.notes ?? true) !== false,
        tracker: (src.eZTimeTracker ?? src.tracker ?? true) !== false,
        clip: (src.eZClip ?? src.clip ?? true) !== false,
        snippetz: (src.eZSnippetZ ?? src.snippetz ?? true) !== false
      };

      if (!resolved.notes && !resolved.tracker && !resolved.clip && !resolved.snippetz) {
        resolved.notes = true;
      }

      await chrome.storage.local.set({ ezSuiteConfig: resolved });
      return resolved;
    } catch (e) {
      return defaultCfg;
    }
  }

  const suiteConfig = await loadSuiteConfig();

  const allViewDefs = [
    { id: 'notes', label: 'eZNotes', enabled: suiteConfig.notes },
    { id: 'tracker', label: 'eZTimeTracker', enabled: suiteConfig.tracker },
    { id: 'clip', label: 'eZClip', enabled: suiteConfig.clip },
    { id: 'snippetz', label: 'eZSnippetZ', enabled: suiteConfig.snippetz }
  ];

  allLogoItems.forEach(logo => {
    const viewId = logo.dataset.view;
    const def = allViewDefs.find(d => d.id === viewId);
    if (!def || !def.enabled) {
      logo.style.display = 'none';
    } else {
      logo.style.display = '';
    }
  });

  const views = allViewDefs.filter(d => d.enabled).map(d => d.id);
  const logoItems = allLogoItems.filter(logo => views.includes(logo.dataset.view));

  let dots = [];
  if (carouselDots) {
    carouselDots.innerHTML = '';
    if (views.length <= 1) {
      carouselDots.style.display = 'none';
      if (carouselContainer) carouselContainer.style.cursor = 'default';
    } else {
      carouselDots.style.display = 'flex';
      views.forEach((vId, idx) => {
        const def = allViewDefs.find(d => d.id === vId);
        const dot = document.createElement('div');
        dot.className = 'dot' + (idx === 0 ? ' active' : '');
        dot.dataset.index = String(idx);
        dot.title = def ? def.label : vId;
        dot.addEventListener('click', () => setViewIndex(idx));
        carouselDots.appendChild(dot);
        dots.push(dot);
      });
    }
  }

  let currentIndex = 0;

  function setViewIndex(index, animate = true) {
    if (views.length === 0) return;
    if (index < 0) index = 0;
    if (index >= views.length) index = views.length - 1;
    currentIndex = index;

    const activeView = views[currentIndex];

    if (carouselTrack && carouselContainer && logoItems[currentIndex]) {
      const activeLogo = logoItems[currentIndex];
      const containerWidth = carouselContainer.offsetWidth || 240;
      const logoCenter = activeLogo.offsetLeft + (activeLogo.offsetWidth / 2);
      const targetOffset = (containerWidth / 2) - logoCenter;

      carouselTrack.style.transition = animate ? 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
      carouselTrack.style.transform = `translateX(${targetOffset}px)`;
    }

    logoItems.forEach((logo, i) => {
      if (i === currentIndex) {
        logo.classList.add('active');
      } else {
        logo.classList.remove('active');
      }
    });

    dots.forEach((dot, i) => {
      if (i === currentIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    if (viewNotes) viewNotes.style.display = (suiteConfig.notes && activeView === 'notes') ? 'block' : 'none';
    if (viewTracker) viewTracker.style.display = (suiteConfig.tracker && activeView === 'tracker') ? 'block' : 'none';
    if (viewClip) viewClip.style.display = (suiteConfig.clip && activeView === 'clip') ? 'block' : 'none';
    if (viewSnippetz) viewSnippetz.style.display = (suiteConfig.snippetz && activeView === 'snippetz') ? 'block' : 'none';

    if (btnLibrary) btnLibrary.style.display = (suiteConfig.notes && activeView === 'notes') ? 'flex' : 'none';

    chrome.storage.local.set({ lastActiveView: activeView });
  }

  logoItems.forEach((logo, idx) => {
    logo.addEventListener('click', (e) => {
      e.stopPropagation();
      setViewIndex(idx);
    });
  });

  if (carouselContainer && views.length > 1) {
    let isDragging = false;
    let startX = 0;
    let currentDeltaX = 0;
    let baseOffset = 0;

    carouselContainer.addEventListener('mousedown', (e) => {
      if (!logoItems[currentIndex]) return;
      isDragging = true;
      startX = e.clientX;
      currentDeltaX = 0;

      const activeLogo = logoItems[currentIndex];
      const containerWidth = carouselContainer.offsetWidth || 240;
      const logoCenter = activeLogo.offsetLeft + (activeLogo.offsetWidth / 2);
      baseOffset = (containerWidth / 2) - logoCenter;

      if (carouselTrack) carouselTrack.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      currentDeltaX = e.clientX - startX;
      if (carouselTrack) {
        carouselTrack.style.transform = `translateX(${baseOffset + currentDeltaX}px)`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;

      if (currentDeltaX < -28 && currentIndex < views.length - 1) {
        setViewIndex(currentIndex + 1);
      } else if (currentDeltaX > 28 && currentIndex > 0) {
        setViewIndex(currentIndex - 1);
      } else {

        setViewIndex(currentIndex);
      }
    });
  }

  if (btnOpenClipApp) {
    btnOpenClipApp.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/clip.html') });
    });
  }

  if (btnOpenSnippetzApp) {
    btnOpenSnippetzApp.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/snippetz.html') });
    });
  }

  async function renderPopupSnippets() {
    if (!popupSnippetzList) return;
    const data = await chrome.storage.local.get('ezSnippetzData');
    const allSnippets = (data.ezSnippetzData || []).filter(s => !s.isDeleted);

    if (snippetzCountBadge) {
      snippetzCountBadge.textContent = `${allSnippets.length} Snippets`;
    }

    if (allSnippets.length === 0) {
      popupSnippetzList.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 10px; padding: 8px 0;">Noch keine Snippets gespeichert</div>';
      return;
    }

    const sorted = [...allSnippets].sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return (b.copyCount || 0) - (a.copyCount || 0);
    }).slice(0, 4);

    popupSnippetzList.innerHTML = '';
    sorted.forEach(snip => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; background: var(--hover-bg); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px; cursor: pointer; transition: all 0.15s;';
      row.onmouseover = () => { row.style.borderColor = '#6366f1'; row.style.background = '#ffffff'; };
      row.onmouseout = () => { row.style.borderColor = 'var(--border-color)'; row.style.background = 'var(--hover-bg)'; };

      const left = document.createElement('div');
      left.style.cssText = 'display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 210px; font-weight: 600;';
      left.innerHTML = `${snip.favorite ? '⭐' : '📄'} <span style="overflow:hidden;text-overflow:ellipsis;">${snip.title}</span>`;

      const copyBtn = document.createElement('span');
      copyBtn.textContent = '📋';
      copyBtn.title = 'Snippet kopieren';

      row.onclick = async () => {
        const fullCode = (snip.blocks || []).map(b => b.content).join('\n\n');
        await navigator.clipboard.writeText(fullCode);
        showHotkeyFeedback(`📋 "${snip.title}" kopiert!`);
      };

      row.appendChild(left);
      row.appendChild(copyBtn);
      popupSnippetzList.appendChild(row);
    });
  }

  renderPopupSnippets();

  const ALL_ACTIONS = [
    {
      id: 'clean',
      title: 'Clean / Trim',
      icon: '🧹',
      transform: (t) => t.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0).join('\n')
    },
    {
      id: 'upper',
      title: 'UPPERCASE',
      icon: '🔠',
      transform: (t) => t.toUpperCase()
    },
    {
      id: 'lower',
      title: 'lowercase',
      icon: '🔡',
      transform: (t) => t.toLowerCase()
    },
    {
      id: 'title',
      title: 'Title Case',
      icon: '📰',
      transform: (t) => t.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase())
    },
    {
      id: 'camel',
      title: 'camelCase',
      icon: '🐪',
      transform: (t) => t.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^(.)/, c => c.toLowerCase())
    },
    {
      id: 'snake',
      title: 'snake_case',
      icon: '🐍',
      transform: (t) => t.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase()
    },
    {
      id: 'kebab',
      title: 'kebab-case',
      icon: '🍢',
      transform: (t) => t.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase()
    },
    {
      id: 'json',
      title: 'JSON Format',
      icon: '⚡',
      transform: (t) => {
        const p = JSON.parse(t);
        return t.includes('\n') ? JSON.stringify(p) : JSON.stringify(p, null, 2);
      }
    },
    {
      id: 'sql',
      title: 'SQL Quoter',
      icon: '🗄️',
      transform: (t) => {
        const lines = t.split(/[\r\n,]+/).map(l => l.trim().replace(/^['"]|['"]$/g, '')).filter(l => l.length > 0);
        return lines.map(l => `'${l}'`).join(', ');
      }
    },
    {
      id: 'sort',
      title: 'Sort & Unique',
      icon: '🔀',
      transform: (t) => {
        const lines = t.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        return Array.from(new Set(lines)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).join('\n');
      }
    },
    {
      id: 'url',
      title: 'URL En/Decode',
      icon: '🌐',
      transform: (t) => t.includes('%') ? decodeURIComponent(t) : encodeURIComponent(t)
    },
    {
      id: 'base64',
      title: 'Base64',
      icon: '🔒',
      transform: (t) => {
        try {
          const dec = atob(t.trim());
          if (/^[\x00-\x7F]*$/.test(dec) && dec.length > 0) return dec;
        } catch (e) {}
        return btoa(unescape(encodeURIComponent(t)));
      }
    }
  ];

  async function getSelectedActionIds() {
    const data = await chrome.storage.local.get('clipQuickActions');
    return data.clipQuickActions || ['clean', 'upper', 'json', 'sql'];
  }

  async function renderQuickActionsGrid() {
    if (!quickActionsGrid) return;
    const selectedIds = await getSelectedActionIds();
    quickActionsGrid.innerHTML = '';

    selectedIds.forEach(id => {
      const act = ALL_ACTIONS.find(a => a.id === id);
      if (!act) return;

      const btn = document.createElement('button');
      btn.className = 'quick-act-btn';
      btn.title = `${act.title} (Klicken zum Transformieren der Zwischenablage)`;
      btn.innerHTML = `<span>${act.icon}</span>`;

      btn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (!text) {
            showHotkeyFeedback('ℹ️ Clipboard ist leer');
            return;
          }
          const result = act.transform(text);
          await navigator.clipboard.writeText(result);

          const hData = await chrome.storage.local.get('clipHistory');
          let items = hData.clipHistory || [];
          items = items.filter(i => (typeof i === 'string' ? i : i.text) !== result);
          items.unshift({ text: result, timestamp: Date.now() });
          if (items.length > 30) items = items.slice(0, 30);
          await chrome.storage.local.set({ clipHistory: items });

          showHotkeyFeedback(`${act.icon} ${act.title} ausgeführt!`);
        } catch (err) {
          showHotkeyFeedback('❌ Fehler bei Ausführung', true);
        }
      });

      quickActionsGrid.appendChild(btn);
    });
  }

  function renderChecklistModal(selectedIds) {
    if (!actionsChecklist) return;
    actionsChecklist.innerHTML = '';

    if (actionsLimitText) {
      actionsLimitText.textContent = `Wähle bis zu 4 Aktionen (ausgewählt: ${selectedIds.length}/4)`;
    }

    ALL_ACTIONS.forEach(act => {
      const isChecked = selectedIds.includes(act.id);
      const row = document.createElement('div');
      row.className = 'row';
      row.style.padding = '4px 0';
      row.style.cursor = 'pointer';

      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '6px';
      label.style.cursor = 'pointer';
      label.innerHTML = `<span>${act.icon}</span> <span>${act.title}</span>`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isChecked;
      checkbox.style.cursor = 'pointer';

      checkbox.addEventListener('change', async () => {
        let current = await getSelectedActionIds();
        if (checkbox.checked) {
          if (current.length >= 4) {
            checkbox.checked = false;
            showHotkeyFeedback('Maximal 4 Quick-Actions erlaubt!', true);
            return;
          }
          current.push(act.id);
        } else {
          current = current.filter(id => id !== act.id);
        }

        await chrome.storage.local.set({ clipQuickActions: current });
        if (actionsLimitText) {
          actionsLimitText.textContent = `Wähle bis zu 4 Aktionen (ausgewählt: ${current.length}/4)`;
        }
        renderQuickActionsGrid();
      });

      row.appendChild(label);
      row.appendChild(checkbox);
      actionsChecklist.appendChild(row);
    });
  }

  if (btnConfigureActions && actionsModal && actionsModalContent) {
    btnConfigureActions.addEventListener('click', async () => {
      const selected = await getSelectedActionIds();
      renderChecklistModal(selected);

      actionsModal.style.display = 'flex';
      actionsModal.offsetHeight;
      actionsModal.style.opacity = '1';
      actionsModalContent.style.transform = 'translateY(0)';
    });

    const closeActionsModal = () => {
      actionsModal.style.opacity = '0';
      actionsModalContent.style.transform = 'translateY(100%)';
      setTimeout(() => {
        actionsModal.style.display = 'none';
      }, 300);
    };

    if (btnCloseActionsModal) btnCloseActionsModal.addEventListener('click', closeActionsModal);
    actionsModal.addEventListener('click', (e) => {
      if (e.target === actionsModal) closeActionsModal();
    });
  }

  renderQuickActionsGrid();

  const applyInitialView = () => {
    chrome.storage.local.get('lastActiveView', (data) => {
      const idx = views.indexOf(data.lastActiveView);
      setViewIndex(idx >= 0 ? idx : 0, false);
    });
  };
  applyInitialView();
  window.addEventListener('load', applyInitialView);

  const ttStatus = document.getElementById('tt-status');
  const ttTime = document.getElementById('tt-time');
  const ttToggleBtn = document.getElementById('tt-toggleBtn');
  const ttTotalTime = document.getElementById('tt-totalTime');
  const ttDashboardBtn = document.getElementById('tt-dashboardBtn');
  let ttInterval = null;

  async function updateTrackerUI() {
    if (!ttStatus) return;
    const data = await chrome.storage.local.get(['ttActive', 'ttStart', 'ttHistory']);
    const now = new Date();

    let todayTotal = 0;
    const startOfToday = new Date(now);
    startOfToday.setHours(0,0,0,0);

    const history = data.ttHistory || [];
    history.forEach(e => {
        if (e.startTime >= startOfToday.getTime()) todayTotal += e.duration;
    });

    if (data.ttActive) {
      const elapsed = Math.floor((Date.now() - data.ttStart) / 1000);
      todayTotal += elapsed;

      ttStatus.textContent = 'AKTIV';
      ttStatus.style.color = '#10b981';
      ttToggleBtn.textContent = '■ Ausstempeln';
      ttToggleBtn.style.background = '#ef4444';
      ttTime.textContent = formatTime(elapsed);
    } else {
      ttStatus.textContent = 'BEREIT';
      ttStatus.style.color = 'var(--text-muted)';
      ttToggleBtn.textContent = '▶ Einstempeln';
      ttToggleBtn.style.background = '#6366f1';
      ttTime.textContent = '00:00:00';
    }

    ttTotalTime.textContent = formatTime(todayTotal);
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  if (ttToggleBtn) {
    ttToggleBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get(['ttActive', 'ttStart', 'ttHistory', 'ttCurrentData', 'ttSettings']);
      let history = data.ttHistory || [];

      if (data.ttActive) {

        let elapsed = Math.floor((Date.now() - data.ttStart) / 1000);
        const rMin = parseInt(data.ttSettings?.rounding || '0', 10);
        if (rMin > 0 && elapsed > 0) {
          const rSec = rMin * 60;
          elapsed = Math.ceil(elapsed / rSec) * rSec;
        }
        const curr = data.ttCurrentData || {};

        history.push({
          id: crypto.randomUUID(),
          startTime: data.ttStart,
          endTime: Date.now(),
          duration: elapsed,
          ticket: curr.ticket || '',
          descShort: curr.descShort || '',
          tags: curr.tags || '',
          task: curr.task || '',
          notes: curr.notes || ''
        });

        history.sort((a, b) => b.startTime - a.startTime);

        await chrome.storage.local.set({
          ttActive: false,
          ttHistory: history,
          ttCurrentData: {}
        });
        clearInterval(ttInterval);
      } else {

        await chrome.storage.local.set({
          ttActive: true,
          ttStart: Date.now(),
          ttCurrentData: {}
        });
        ttInterval = setInterval(updateTrackerUI, 1000);
      }
      updateTrackerUI();
    });
  }

  if (ttDashboardBtn) {
    ttDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/timetracker_dashboard.html') });
    });
  }

  updateTrackerUI();
  chrome.storage.local.get('ttActive', (data) => {
    if (data.ttActive) {
      ttInterval = setInterval(updateTrackerUI, 1000);
    }
  });

  checkForUpdates();

  async function checkForUpdates() {
    try {
      const response = await fetch('https://raw.githubusercontent.com/SaschaArend/eZSuite/main/manifest.json');
      if (!response.ok) return;
      const remoteManifest = await response.json();
      const remoteVersion = remoteManifest.version;
      const localVersion = chrome.runtime.getManifest().version;

      const isNewerVersion = (local, remote) => {
        const lParts = local.split('.').map(Number);
        const rParts = remote.split('.').map(Number);
        for (let i = 0; i < Math.max(lParts.length, rParts.length); i++) {
          const l = lParts[i] || 0;
          const r = rParts[i] || 0;
          if (r > l) return true;
          if (r < l) return false;
        }
        return false;
      };

      if (remoteVersion && isNewerVersion(localVersion, remoteVersion)) {
        const banner = document.getElementById('updateBanner');
        const remoteVersionText = document.getElementById('remoteVersionText');
        const btnUpdateInfo = document.getElementById('btnUpdateInfo');

        if (banner && remoteVersionText) {
          remoteVersionText.textContent = remoteVersion;
          banner.style.display = 'flex';

          if (btnUpdateInfo) {
            btnUpdateInfo.onclick = () => {
              alert(`Ein neues Update für eZSuite ist verfügbar!\n\nInstalliert: v${localVersion}\nVerfügbar auf GitHub: v${remoteVersion}\n\nBitte schließe Google Chrome komplett und führe die Datei "update.bat" im Projektordner aus, um das Update automatisch durchzuführen.`);
            };
          }
        }
      }
    } catch (e) {
      console.warn('[UpdateCheck] Fehler:', e);
    }
  }

  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const settingsModal = document.getElementById('settingsModal');
  const settingsModalContent = document.getElementById('settingsModalContent');

  if (btnOpenSettings && btnCloseSettings && settingsModal && settingsModalContent) {
    btnOpenSettings.addEventListener('click', () => {
      settingsModal.style.display = 'flex';

      settingsModal.offsetHeight;
      settingsModal.style.opacity = '1';
      settingsModalContent.style.transform = 'translateY(0)';
    });

    const closeSettings = () => {
      settingsModal.style.opacity = '0';
      settingsModalContent.style.transform = 'translateY(100%)';
      setTimeout(() => {
        settingsModal.style.display = 'none';
      }, 300);
    };

    btnCloseSettings.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        closeSettings();
      }
    });
  }
});
