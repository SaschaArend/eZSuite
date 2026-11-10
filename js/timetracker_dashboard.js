document.addEventListener('DOMContentLoaded', async () => {

  const tabLive = document.getElementById('tabLive');
  const tabManual = document.getElementById('tabManual');
  const viewLive = document.getElementById('viewLive');
  const viewManualDates = document.getElementById('viewManualDates');

  const sbStatus = document.getElementById('sbStatus');
  const sbDate = document.getElementById('sbDate');
  const sbTime = document.getElementById('sbTime');
  const btnToggle = document.getElementById('btnToggle');
  const statSbToday = document.getElementById('statSbToday');
  const statSbWeek = document.getElementById('statSbWeek');
  const warningBanner = document.getElementById('warningBanner');

  const tabVerlauf = document.getElementById('tabVerlauf');
  const tabTickets = document.getElementById('tabTickets');
  const viewVerlaufMain = document.getElementById('viewVerlaufMain');
  const viewTicketsMain = document.getElementById('viewTicketsMain');
  const topActionsVerlauf = document.getElementById('topActionsVerlauf');

  const btnImportCsv = document.getElementById('btnImportCsv');
  const fileImportCsv = document.getElementById('fileImportCsv');
  const ticketsListEl = document.getElementById('ticketsList');
  const modalTicketDetail = document.getElementById('modalTicketDetail');
  const btnCloseTicketDetail = document.getElementById('btnCloseTicketDetail');
  const btnBookTicket = document.getElementById('btnBookTicket');
  const inpTicketSearch = document.getElementById('inpTicketSearch');
  const selTicketState = document.getElementById('selTicketState');
  const selTicketSort = document.getElementById('selTicketSort');

  const inpTicket = document.getElementById('inpTicket');
  const inpDescShort = document.getElementById('inpDescShort');
  const inpTags = document.getElementById('inpTags');
  const inpTask = document.getElementById('inpTask');
  const inpNotes = document.getElementById('inpNotes');
  const ticketList = document.getElementById('ticketList');

  const inpManualStart = document.getElementById('inpManualStart');
  const inpManualEnd = document.getElementById('inpManualEnd');

  const historyTableBody = document.getElementById('historyTableBody');
  const hdrCurrentPeriodLabel = document.getElementById('hdrCurrentPeriodLabel');
  const hdrWeekSum = document.getElementById('hdrWeekSum');
  const footerTotal = document.getElementById('footerTotal');
  const inpSearch = document.getElementById('inpSearch');
  const btnPrevPeriod = document.getElementById('btnPrevPeriod');
  const btnNextPeriod = document.getElementById('btnNextPeriod');
  const periodFilters = document.querySelectorAll('.period-filter');

  const btnSettings = document.getElementById('btnSettings');
  const modalSettings = document.getElementById('modalSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');

  const setName = document.getElementById('setName');
  const setLanguage = document.getElementById('setLanguage');
  const setTimeFormat = document.getElementById('setTimeFormat');
  const setWeekSum = document.getElementById('setWeekSum');
  const setStickyHeader = document.getElementById('setStickyHeader');

  const setRounding = document.getElementById('setRounding');
  const setRemind8h = document.getElementById('setRemind8h');
  const setPomodoro = document.getElementById('setPomodoro');
  const setShowWidget = document.getElementById('setShowWidget');
  const setInactivity = document.getElementById('setInactivity');
  const setDailyGoal = document.getElementById('setDailyGoal');
  const setWeeklyGoal = document.getElementById('setWeeklyGoal');
  const setWorkHours = document.getElementById('setWorkHours');
  const setEndTime = document.getElementById('setEndTime');
  const setBudgets = document.getElementById('setBudgets');

  const setPdfColor = document.getElementById('setPdfColor');
  const setYouTrack = document.getElementById('setYouTrack');
  const fileUpload = document.getElementById('fileUpload');
  const btnUploadLogo = document.getElementById('btnUploadLogo');
  const btnRemoveLogo = document.getElementById('btnRemoveLogo');
  const setLogoPreview = document.getElementById('setLogoPreview');
  const btnDownloadBackup = document.getElementById('btnDownloadBackup');
  const btnImportBackup = document.getElementById('btnImportBackup');
  const fileImportBackup = document.getElementById('fileImportBackup');

  const btnOpenExport = document.getElementById('btnOpenExport');
  const modalExport = document.getElementById('modalExport');
  const btnCloseExport = document.getElementById('btnCloseExport');

  const modalEdit = document.getElementById('modalEdit');
  const btnCloseEdit = document.getElementById('btnCloseEdit');
  const btnSaveEdit = document.getElementById('btnSaveEdit');
  const btnDeleteEntry = document.getElementById('btnDeleteEntry');
  const editStart = document.getElementById('editStart');
  const editEnd = document.getElementById('editEnd');
  const editDurCalc = document.getElementById('editDurCalc');
  const editIndex = document.getElementById('editIndex');

  const editTicket = document.getElementById('editTicket');
  const editDescShort = document.getElementById('editDescShort');
  const editTags = document.getElementById('editTags');
  const editTask = document.getElementById('editTask');
  const editNotes = document.getElementById('editNotes');
  const editSubtitle = document.getElementById('editSubtitle');

  let historyData = [];
  let filteredData = [];
  let settingsData = {
    pdfColor: '#4f46e5', youtrackUrl: '', logoBase64: '', name: '',
    language: 'de', timeFormat: '24', weekSum: false, stickyHeader: true,
    rounding: '0', remind8h: true, pomodoro: false, showWidget: false, inactivity: '15',
    dailyGoal: '0', weeklyGoal: '0', workHours: '8', endTime: '18:00', budgets: '',
    ticketViewMode: 'grid'
  };
  let ticketsData = [];
  let ticketsStates = new Set();
  let currentActiveTicket = null;
  let ttInterval = null;

  let isManualMode = false;
  let currentPeriod = 'all';
  let periodOffset = 0;

  const days = ['SO.', 'MO.', 'DI.', 'MI.', 'DO.', 'FR.', 'SA.'];
  const months = ['JAN.', 'FEB.', 'MÄRZ', 'APR.', 'MAI', 'JUNI', 'JULI', 'AUG.', 'SEPT.', 'OKT.', 'NOV.', 'DEZ.'];

  const formatLocal = (d) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  async function loadData() {
    const data = await chrome.storage.local.get(['ttHistory', 'ttSettings', 'ttCurrentData', 'ttTickets']);
    historyData = data.ttHistory || [];
    historyData.sort((a, b) => b.startTime - a.startTime);

    ticketsData = data.ttTickets || [];
    renderTickets();

    if (data.ttSettings) {
      settingsData = { ...settingsData, ...data.ttSettings };
      updateViewButtons();
      setName.value = settingsData.name || '';

      setRounding.checked = settingsData.rounding === '15';
      setRemind8h.checked = settingsData.remind8h !== false;
      setPomodoro.checked = settingsData.pomodoro === true;
      setShowWidget.checked = settingsData.showWidget === true;

      setPdfColor.value = settingsData.pdfColor || '#4f46e5';
      setYouTrack.value = settingsData.youtrackUrl || '';
      if (settingsData.logoBase64) setLogoPreview.src = settingsData.logoBase64;
    }

    if (settingsData.remind8h !== false) {
       check8hReminder();
    }

    if (data.ttCurrentData) {
      inpTicket.value = data.ttCurrentData.ticket || '';
      inpDescShort.value = data.ttCurrentData.descShort || '';
      inpTags.value = data.ttCurrentData.tags || '';
      inpTask.value = data.ttCurrentData.task || '';
      inpNotes.value = data.ttCurrentData.notes || '';
    }

    updateTicketDatalist();
    applyFilters();
    initTimerSync();

    const now = new Date();
    inpManualStart.value = formatLocal(now);
    inpManualEnd.value = formatLocal(now);
  }

  function updateTicketDatalist() {
    const tickets = new Set();
    historyData.forEach(e => {
      if (e.ticket && e.ticket.trim() !== '') tickets.add(e.ticket.trim());
    });
    ticketList.innerHTML = '';
    Array.from(tickets).slice(0, 20).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      ticketList.appendChild(opt);
    });
  }

  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function formatTime(dateObj) {
    if (settingsData.timeFormat === '12') {
      return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  tabLive.addEventListener('click', () => {
    isManualMode = false;
    tabLive.classList.add('active');
    tabManual.classList.remove('active');
    viewLive.style.display = 'block';
    viewManualDates.style.display = 'none';
    updateTrackerUI();
  });

  tabManual.addEventListener('click', () => {
    isManualMode = true;
    tabLive.classList.remove('active');
    tabManual.classList.add('active');
    viewLive.style.display = 'none';
    viewManualDates.style.display = 'block';

    btnToggle.textContent = 'Eintrag hinzufügen';
    btnToggle.style.background = 'var(--card-bg)';
    btnToggle.style.color = 'var(--text-main)';
    btnToggle.style.border = '1px solid var(--border-color)';

    sbStatus.textContent = 'MANUELL';
    sbStatus.style.color = 'var(--text-muted)';
  });

  function getStartOfPeriod(dateObj, period) {
    const d = new Date(dateObj);
    d.setHours(0,0,0,0);
    if (period === 'day') return d;
    if (period === 'week') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    }
    if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    if (period === 'year') return new Date(d.getFullYear(), 0, 1);
    return d;
  }

  function getEndOfPeriod(startOfPeriod, period) {
    const d = new Date(startOfPeriod);
    if (period === 'day') d.setDate(d.getDate() + 1);
    else if (period === 'week') d.setDate(d.getDate() + 7);
    else if (period === 'month') d.setMonth(d.getMonth() + 1);
    else if (period === 'year') d.setFullYear(d.getFullYear() + 1);
    return new Date(d.getTime() - 1);
  }

  function applyFilters() {
    let q = inpSearch.value.toLowerCase().trim();
    const nowRef = new Date();
    let pStart = 0, pEnd = Infinity;

    if (currentPeriod !== 'all') {
      let baseDate = new Date(nowRef);
      if (currentPeriod === 'day') baseDate.setDate(baseDate.getDate() + periodOffset);
      else if (currentPeriod === 'week') baseDate.setDate(baseDate.getDate() + (periodOffset * 7));
      else if (currentPeriod === 'month') baseDate.setMonth(baseDate.getMonth() + periodOffset);
      else if (currentPeriod === 'year') baseDate.setFullYear(baseDate.getFullYear() + periodOffset);

      const sDate = getStartOfPeriod(baseDate, currentPeriod);
      const eDate = getEndOfPeriod(sDate, currentPeriod);
      pStart = sDate.getTime();
      pEnd = eDate.getTime();

      if (currentPeriod === 'day') hdrCurrentPeriodLabel.textContent = sDate.toLocaleDateString('de-DE');
      else if (currentPeriod === 'week') hdrCurrentPeriodLabel.textContent = `KW ${getWeekNumber(sDate)} / ${sDate.getFullYear()}`;
      else if (currentPeriod === 'month') hdrCurrentPeriodLabel.textContent = `${sDate.toLocaleString('de-DE', {month:'long'})} ${sDate.getFullYear()}`;
      else if (currentPeriod === 'year') hdrCurrentPeriodLabel.textContent = `${sDate.getFullYear()}`;
    } else {
      hdrCurrentPeriodLabel.textContent = 'Alle Zeiten';
    }

    filteredData = historyData.filter(e => {
      if (e.startTime < pStart || e.startTime > pEnd) return false;
      if (q) {
        const txt = ((e.ticket || '') + ' ' + (e.task || '') + ' ' + (e.tags || '') + ' ' + (e.descShort || '')).toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });

    renderDashboard();
  }

  function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  }

  function renderDashboard() {
    let totalSec = 0;
    historyTableBody.innerHTML = '';

    if (filteredData.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.style.textAlign = 'center';
      td.style.padding = '40px';
      td.style.color = 'var(--text-muted)';
      td.textContent = 'Keine Einträge gefunden.';
      tr.appendChild(td);
      historyTableBody.appendChild(tr);
    } else {

      let daysMap = {};
      filteredData.forEach(entry => {
        const dStr = new Date(entry.startTime).toDateString();
        if(!daysMap[dStr]) daysMap[dStr] = [];
        daysMap[dStr].push(entry);
      });

      let currentDayStr = '';

      filteredData.forEach((entry, fIdx) => {
        const realIndex = historyData.findIndex(e => e.startTime === entry.startTime);
        totalSec += entry.duration;
        const entryDate = new Date(entry.startTime);
        const dayKey = entryDate.toDateString();
        const dStr = entryDate.toLocaleDateString(settingsData.language === 'en' ? 'en-US' : 'de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        if (dayKey !== currentDayStr) {
          const trDay = document.createElement('tr');
          trDay.className = 'day-group';
          if (!settingsData.stickyHeader) trDay.classList.add('no-sticky');
          const thDay = document.createElement('th');
          thDay.colSpan = 6;
          thDay.textContent = dStr.toUpperCase();
          trDay.appendChild(thDay);
          historyTableBody.appendChild(trDay);
          currentDayStr = dayKey;
        }

        const tr = document.createElement('tr');
        tr.className = 'history-row';

        const tdTime = document.createElement('td');
        tdTime.className = 'timeline-cell';
        tdTime.onclick = () => openEditModal(realIndex);

        const dayEntries = daysMap[dayKey];
        const dayIndex = dayEntries.indexOf(entry);

        const prevEntry = dayIndex > 0 ? dayEntries[dayIndex - 1] : null;
        const nextEntry = dayIndex < dayEntries.length - 1 ? dayEntries[dayIndex + 1] : null;

        const sameTicketAsPrev = prevEntry && entry.ticket && prevEntry.ticket === entry.ticket;
        const sameTicketAsNext = nextEntry && entry.ticket && nextEntry.ticket === entry.ticket;

        const isFirstOfStreak = !sameTicketAsPrev;
        const isLastOfStreak = !sameTicketAsNext;
        const singleEntryStreak = isFirstOfStreak && isLastOfStreak;

        const dot = document.createElement('div');
        dot.className = 'timeline-dot';

        const line = document.createElement('div');
        line.className = 'timeline-line';
        if (singleEntryStreak) {
          line.style.display = 'none';
        } else {
          if (isFirstOfStreak) line.style.top = '50%';
          if (isLastOfStreak) line.style.bottom = '50%';
        }

        tdTime.appendChild(line);
        tdTime.appendChild(dot);

        const spanTime = document.createElement('span');
        const start = formatTime(entryDate);
        const end = formatTime(new Date(entry.endTime));
        spanTime.textContent = `${start} - ${end}`;
        tdTime.appendChild(spanTime);

        const tdTicket = document.createElement('td');
        tdTicket.onclick = () => openEditModal(realIndex);
        if (entry.ticket) {
          if (settingsData.youtrackUrl) {
            const a = document.createElement('a');
            a.className = 'ticket-link';
            let url = settingsData.youtrackUrl;
            if (!url.endsWith('/')) url += '/';
            a.href = url + entry.ticket;
            a.target = '_blank';
            a.textContent = entry.ticket;
            a.onclick = (e) => e.stopPropagation();
            tdTicket.appendChild(a);
          } else {
            tdTicket.textContent = entry.ticket;
          }
        } else {
          tdTicket.textContent = '-';
        }

        const tdTask = document.createElement('td');
        tdTask.onclick = () => openEditModal(realIndex);
        const taskText = entry.task || '-';

        const spanWrapper = document.createElement('div');
        spanWrapper.className = 'expand-text';
        spanWrapper.innerHTML = `<span style="font-weight:500;">${taskText}</span>`;
        if (entry.descShort) spanWrapper.innerHTML += `<br><small style="color:var(--text-muted)">${entry.descShort}</small>`;
        tdTask.appendChild(spanWrapper);

        const tdTags = document.createElement('td');
        tdTags.onclick = () => openEditModal(realIndex);
        if (entry.tags) {
          tdTags.innerHTML = `<small style="color:var(--text-muted)">${entry.tags}</small>`;
        } else {
          tdTags.textContent = '-';
        }

        const tdNotes = document.createElement('td');
        tdNotes.onclick = () => openEditModal(realIndex);
        if (entry.notes) {
          tdNotes.innerHTML = `<small style="color:var(--text-muted)">${entry.notes}</small>`;
        } else {
          tdNotes.textContent = '-';
        }

        const tdDur = document.createElement('td');
        tdDur.style.textAlign = 'right';
        tdDur.style.fontWeight = '700';

        const spanDur = document.createElement('span');
        spanDur.textContent = formatDuration(entry.duration);
        spanDur.style.cursor = 'pointer';
        spanDur.onclick = () => openEditModal(realIndex);
        tdDur.appendChild(spanDur);

        const playBtn = document.createElement('button');
        playBtn.className = 'play-btn';
        playBtn.innerHTML = '▶';
        playBtn.title = 'Diese Zeit fortsetzen';
        playBtn.onclick = (e) => {
          e.stopPropagation();
          resumeEntry(entry);
        };
        tdDur.appendChild(playBtn);

        tr.appendChild(tdTime);
        tr.appendChild(tdTicket);
        tr.appendChild(tdTask);
        tr.appendChild(tdTags);
        tr.appendChild(tdNotes);
        tr.appendChild(tdDur);

        historyTableBody.appendChild(tr);

        requestAnimationFrame(() => {
          if (spanWrapper.scrollHeight > 40) {
            const expBtn = document.createElement('div');
            expBtn.className = 'expand-btn';
            expBtn.textContent = '... mehr anzeigen';
            expBtn.onclick = (e) => {
              e.stopPropagation();
              spanWrapper.classList.toggle('expanded');
              expBtn.textContent = spanWrapper.classList.contains('expanded') ? 'weniger anzeigen' : '... mehr anzeigen';
            };
            tdTask.appendChild(expBtn);
          }
        });
      });
    }

    footerTotal.textContent = formatDuration(totalSec);
  }

  async function resumeEntry(entry) {
    if (!isManualMode) {
      const data = await chrome.storage.local.get('ttActive');
      if (data.ttActive) {
        if (!confirm('Es läuft bereits ein Timer. Möchtest du den aktuellen stoppen und diesen starten?')) return;

        await stopCurrentTimer();
      }

      inpTicket.value = entry.ticket || '';
      inpDescShort.value = entry.descShort || '';
      inpTags.value = entry.tags || '';
      inpTask.value = entry.task || '';
      inpNotes.value = entry.notes || '';

      const nowObj = new Date();
      await chrome.storage.local.set({
        ttActive: true,
        ttStart: Date.now(),
        ttLastDate: nowObj.toDateString(),
        ttLastPomodoro: 0,
        ttCurrentData: {
          ticket: inpTicket.value,
          descShort: inpDescShort.value,
          tags: inpTags.value,
          task: inpTask.value,
          notes: inpNotes.value
        }
      });
      ttInterval = setInterval(updateTrackerUI, 1000);
      updateTrackerUI();
    } else {

      inpTicket.value = entry.ticket || '';
      inpDescShort.value = entry.descShort || '';
      inpTags.value = entry.tags || '';
      inpTask.value = entry.task || '';
      inpNotes.value = entry.notes || '';
    }
  }

  async function stopCurrentTimer() {
    const data = await chrome.storage.local.get(['ttActive', 'ttStart']);
    if (!data.ttActive) return;

    let elapsed = Math.floor((Date.now() - data.ttStart) / 1000);
    const rMin = parseInt(settingsData.rounding || '0', 10);
    if (rMin > 0 && elapsed > 0) {
      const rSec = rMin * 60;
      elapsed = Math.ceil(elapsed / rSec) * rSec;
    }

    const hData = await chrome.storage.local.get('ttCurrentData');
    const curr = hData.ttCurrentData || {};

    const entry = {
      id: crypto.randomUUID(),
      startTime: data.ttStart,
      endTime: Date.now(),
      duration: elapsed,
      ticket: curr.ticket || '',
      descShort: curr.descShort || '',
      tags: curr.tags || '',
      task: curr.task || '',
      notes: curr.notes || ''
    };

    let history = historyData;
    history.push(entry);

    await chrome.storage.local.set({
      ttActive: false,
      ttHistory: history,
      ttCurrentData: {},
      ttLastPomodoro: 0
    });
    clearInterval(ttInterval);
    ttInterval = null;
    historyData = history;
    historyData.sort((a, b) => b.startTime - a.startTime);
    applyFilters();
  }

  inpSearch.addEventListener('input', applyFilters);

  periodFilters.forEach(f => {
    f.addEventListener('click', () => {
      periodFilters.forEach(pf => pf.classList.remove('active'));
      f.classList.add('active');
      currentPeriod = f.dataset.period;
      periodOffset = 0;
      applyFilters();
    });
  });

  btnPrevPeriod.addEventListener('click', () => { if (currentPeriod !== 'all') { periodOffset--; applyFilters(); } });
  btnNextPeriod.addEventListener('click', () => { if (currentPeriod !== 'all') { periodOffset++; applyFilters(); } });

  async function saveInputsToCurrentData() {
    if (isManualMode) return;
    const data = await chrome.storage.local.get('ttActive');
    if (data.ttActive) {
      await chrome.storage.local.set({
        ttCurrentData: {
          ticket: inpTicket.value,
          descShort: inpDescShort.value,
          tags: inpTags.value,
          task: inpTask.value,
          notes: inpNotes.value
        }
      });
    }
  }

  [inpTicket, inpDescShort, inpTags, inpTask, inpNotes].forEach(el => {
    el.addEventListener('input', saveInputsToCurrentData);
  });

  async function initTimerSync() {
    updateTrackerUI();
    const data = await chrome.storage.local.get('ttActive');
    if (data.ttActive) {
      if (settingsData.remind8h !== false) check8hReminder();
      if (settingsData.pomodoro) checkPomodoro();
      ttInterval = setInterval(() => {
          updateTrackerUI();
          if (settingsData.remind8h !== false) check8hReminder();
          if (settingsData.pomodoro) checkPomodoro();
      }, 1000);
    }
  }

  async function check8hReminder() {
    const data = await chrome.storage.local.get(['ttActive', 'ttStart']);
    if (data.ttActive) {
       const elapsed = Math.floor((Date.now() - data.ttStart) / 1000);
       if (elapsed >= 8 * 3600) {
           showWarningBanner('Ein Timer läuft bereits seit über 8 Stunden!');
       } else {
           hideWarningBanner();
       }
    } else {
       hideWarningBanner();
    }
  }

  async function checkPomodoro() {
    const data = await chrome.storage.local.get(['ttActive', 'ttStart', 'ttLastPomodoro']);
    if (data.ttActive) {
       const elapsed = Math.floor((Date.now() - data.ttStart) / 1000);
       const pomodoroInterval = 25 * 60;

       const currentPeriod = Math.floor(elapsed / pomodoroInterval);
       const lastPeriod = data.ttLastPomodoro || 0;

       if (currentPeriod > 0 && currentPeriod > lastPeriod) {
           await chrome.storage.local.set({ ttLastPomodoro: currentPeriod });

           if (window.chrome && chrome.notifications) {
               chrome.notifications.create({
                   type: 'basic',
                   iconUrl: '../icons/SuiteIcon.png',
                   title: 'Pomodoro-Pause!',
                   message: 'Du hast 25 Minuten konzentriert gearbeitet. Zeit für 5 Minuten Pause!'
               });
           }
       }
    }
  }

  async function updateTrackerUI() {
    const data = await chrome.storage.local.get(['ttActive', 'ttStart']);
    const nowObj = new Date();

    const dStr = days[nowObj.getDay()] + ', ' + nowObj.getDate() + '. ' + months[nowObj.getMonth()];
    sbDate.textContent = dStr;

    let todayTotal = 0;
    let dynamicWeek = 0;

    const startOfToday = new Date(nowObj);
    startOfToday.setHours(0,0,0,0);
    const startOfWeek = getStartOfPeriod(nowObj, 'week');

    historyData.forEach(e => {
        if (e.startTime >= startOfToday.getTime()) todayTotal += e.duration;
        if (e.startTime >= startOfWeek.getTime()) dynamicWeek += e.duration;
    });

    if (!isManualMode) {
      if (data.ttActive) {
        const elapsed = Math.floor((Date.now() - data.ttStart) / 1000);
        sbStatus.textContent = 'AKTIV';
        sbStatus.style.color = '#10b981';
        btnToggle.textContent = '■ Ausstempeln';
        btnToggle.style.background = '#ef4444';
        btnToggle.style.color = 'white';
        btnToggle.style.border = 'none';
        sbTime.textContent = formatDuration(elapsed);

        const currTicket = (inpTicket.value || '').trim();
        document.title = `🔴 ${formatDuration(elapsed)}${currTicket ? ' - ' + currTicket : ''}`;

        if (settingsData.remind8h && elapsed > 8 * 3600) warningBanner.style.display = 'block';
        else warningBanner.style.display = 'none';

        dynamicWeek += elapsed;
        statSbToday.textContent = formatDuration(todayTotal + elapsed);
      } else {
        sbStatus.textContent = 'BEREIT';
        sbStatus.style.color = 'var(--text-muted)';
        btnToggle.textContent = '▶ Einstempeln';
        btnToggle.style.background = 'var(--card-bg)';
        btnToggle.style.color = 'var(--text-main)';
        btnToggle.style.border = '1px solid var(--border-color)';
        sbTime.textContent = '00:00:00';
        document.title = 'eZTimeTracker';
        warningBanner.style.display = 'none';
        statSbToday.textContent = formatDuration(todayTotal);
      }
    } else {
      if (data.ttActive) {
          const elapsed = Math.floor((Date.now() - data.ttStart) / 1000);
          todayTotal += elapsed;
          dynamicWeek += elapsed;
      }
      statSbToday.textContent = formatDuration(todayTotal);
    }

    statSbWeek.textContent = formatDuration(dynamicWeek);

    if (settingsData.weekSum) {
      hdrWeekSum.style.display = 'block';
      hdrWeekSum.textContent = `Woche: ${formatDuration(dynamicWeek)}`;
    } else {
      hdrWeekSum.style.display = 'none';
    }
  }

  btnToggle.addEventListener('click', async () => {
    if (isManualMode) {

      const s = new Date(inpManualStart.value).getTime();
      const e = new Date(inpManualEnd.value).getTime();
      if (isNaN(s) || isNaN(e) || e < s) return alert('Bitte gültige Start- und Endzeit angeben!');

      const entry = {
        date: new Date(s).toISOString(),
        startTime: s,
        endTime: e,
        duration: Math.floor((e - s) / 1000),
        ticket: inpTicket.value,
        descShort: inpDescShort.value,
        tags: inpTags.value,
        task: inpTask.value,
        notes: inpNotes.value
      };

      historyData.push(entry);
      await chrome.storage.local.set({ ttHistory: historyData });

      [inpTicket, inpDescShort, inpTags, inpTask, inpNotes].forEach(el => el.value = '');
      inpManualStart.value = formatLocal(new Date());
      inpManualEnd.value = formatLocal(new Date());
      alert('Manueller Eintrag gespeichert!');
      return;
    }

    const data = await chrome.storage.local.get(['ttActive', 'ttStart']);

    if (data.ttActive) {
      await stopCurrentTimer();
      [inpTicket, inpDescShort, inpTags, inpTask, inpNotes].forEach(el => el.value = '');
    } else {
      await chrome.storage.local.set({
        ttActive: true,
        ttStart: Date.now(),
        ttLastPomodoro: 0,
        ttCurrentData: {
          ticket: inpTicket.value,
          descShort: inpDescShort.value,
          tags: inpTags.value,
          task: inpTask.value,
          notes: inpNotes.value
        }
      });
      ttInterval = setInterval(updateTrackerUI, 1000);
    }
    updateTrackerUI();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.ttHistory) {
        historyData = changes.ttHistory.newValue || [];
        historyData.sort((a, b) => b.startTime - a.startTime);
        updateTicketDatalist();
        applyFilters();
      }

      if (changes.ttActive) {
        if (changes.ttActive.newValue === true) {
          if (!ttInterval) ttInterval = setInterval(updateTrackerUI, 1000);
        } else {
          clearInterval(ttInterval);
          ttInterval = null;
        }
      }

      if (changes.ttCurrentData) {
        const c = changes.ttCurrentData.newValue || {};
        if (document.activeElement !== inpTicket) inpTicket.value = c.ticket || '';
        if (document.activeElement !== inpDescShort) inpDescShort.value = c.descShort || '';
        if (document.activeElement !== inpTags) inpTags.value = c.tags || '';
        if (document.activeElement !== inpTask) inpTask.value = c.task || '';
        if (document.activeElement !== inpNotes) inpNotes.value = c.notes || '';
      }
      updateTrackerUI();
    }
  });

  btnSettings.onclick = () => modalSettings.style.display = 'flex';
  btnCloseSettings.onclick = () => {

    loadData();
    modalSettings.style.display = 'none';
  }

  btnUploadLogo.onclick = () => fileUpload.click();
  btnRemoveLogo.onclick = () => {
    setLogoPreview.src = '';
    settingsData.logoBase64 = '';
  }
  fileUpload.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e2) => {
        setLogoPreview.src = e2.target.result;
        settingsData.logoBase64 = e2.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  if (btnDownloadBackup) {
    btnDownloadBackup.onclick = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historyData, null, 2));
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", "eZTimeTracker_Backup.json");
      dlAnchorElem.click();
    };
  }

  if (btnImportBackup && fileImportBackup) {
    btnImportBackup.onclick = () => fileImportBackup.click();
    fileImportBackup.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
             historyData = imported;
             historyData.sort((a, b) => b.startTime - a.startTime);
             await chrome.storage.local.set({ ttHistory: historyData });
             applyFilters();
             alert('Backup erfolgreich importiert!');
          } else {
             alert('Fehler: Ungültiges Dateiformat.');
          }
        } catch (err) {
          alert('Fehler beim Lesen der Datei: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  btnSaveSettings.onclick = async () => {
    settingsData.name = setName.value;
    settingsData.rounding = setRounding.checked ? '15' : '0';
    settingsData.remind8h = setRemind8h.checked;
    settingsData.pomodoro = setPomodoro.checked;
    settingsData.showWidget = setShowWidget.checked;

    settingsData.pdfColor = setPdfColor.value;
    settingsData.youtrackUrl = setYouTrack.value;

    await chrome.storage.local.set({ ttSettings: settingsData });
    applyFilters();
    modalSettings.style.display = 'none';
  };

  function openEditModal(index) {
    const entry = historyData[index];
    if (!entry) return;
    editIndex.value = index;

    const sd = new Date(entry.startTime);
    const ed = new Date(entry.endTime);

    editSubtitle.textContent = sd.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
    editStart.value = formatLocal(sd);
    editEnd.value = formatLocal(ed);
    editDurCalc.textContent = formatDuration(entry.duration);

    editTicket.value = entry.ticket || '';
    editDescShort.value = entry.descShort || '';
    editTags.value = entry.tags || '';
    editTask.value = entry.task || '';
    editNotes.value = entry.notes || '';

    modalEdit.style.display = 'flex';
  }

  function recalcEditDuration() {
    const s = new Date(editStart.value).getTime();
    const e = new Date(editEnd.value).getTime();
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      editDurCalc.textContent = formatDuration(Math.floor((e - s) / 1000));
    } else {
      editDurCalc.textContent = 'Ungültig';
    }
  }

  editStart.addEventListener('input', recalcEditDuration);
  editEnd.addEventListener('input', recalcEditDuration);

  btnCloseEdit.onclick = () => modalEdit.style.display = 'none';

  btnSaveEdit.onclick = async () => {
    const s = new Date(editStart.value).getTime();
    const e = new Date(editEnd.value).getTime();
    if (isNaN(s) || isNaN(e) || e < s) return alert('Ungültige Zeitangaben!');

    const idx = parseInt(editIndex.value);
    historyData[idx].startTime = s;
    historyData[idx].endTime = e;
    historyData[idx].duration = Math.floor((e - s) / 1000);

    historyData[idx].ticket = editTicket.value;
    historyData[idx].descShort = editDescShort.value;
    historyData[idx].tags = editTags.value;
    historyData[idx].task = editTask.value;
    historyData[idx].notes = editNotes.value;

    historyData.sort((a, b) => b.startTime - a.startTime);
    await chrome.storage.local.set({ ttHistory: historyData });
    applyFilters();
    updateTrackerUI();
    modalEdit.style.display = 'none';
  };

  btnDeleteEntry.onclick = async () => {
    const idx = parseInt(editIndex.value);
    historyData.splice(idx, 1);
    await chrome.storage.local.set({ ttHistory: historyData });
    modalEdit.style.display = 'none';
  };

  let currentExportFormat = 'pdf';
  const fmtBoxes = document.querySelectorAll('.format-box');
  const expSubtitle = document.getElementById('expSubtitle');
  const expTicketFilter = document.getElementById('expTicketFilter');
  const expSortNewest = document.getElementById('expSortNewest');
  const expTimesOnly = document.getElementById('expTimesOnly');
  const expShowDate = document.getElementById('expShowDate');
  const expFilename = document.getElementById('expFilename');
  const btnDoExport = document.getElementById('btnDoExport');

  fmtBoxes.forEach(box => {
    box.addEventListener('click', (e) => {
        fmtBoxes.forEach(fb => fb.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentExportFormat = e.currentTarget.dataset.fmt;
        updateExportFilename();

        if (currentExportFormat === 'md') {
           expFilename.parentElement.style.display = 'none';
           btnDoExport.innerHTML = '📋 MD kopieren';
        } else {
           expFilename.parentElement.style.display = 'block';
           if (currentExportFormat === 'pdf') btnDoExport.innerHTML = '📥 PDF exportieren';
           if (currentExportFormat === 'csv') btnDoExport.innerHTML = '📥 CSV exportieren';
        }
    });
  });

  function updateExportFilename() {
    const ext = currentExportFormat;
    expFilename.textContent = `eZTimeTracker-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
    if (currentExportFormat !== 'md') btnDoExport.textContent = `📥 ${ext.toUpperCase()} exportieren`;
  }

  function getExportFilteredData() {
    let data = [...filteredData];
    const tf = expTicketFilter.value;
    if (tf) data = data.filter(e => e.ticket === tf);
    if (!expSortNewest.checked) {
      data.sort((a, b) => a.startTime - b.startTime);
    } else {
      data.sort((a, b) => b.startTime - a.startTime);
    }
    return data;
  }

  function updateExportSubtitle() {
    const data = getExportFilteredData();
    let totalSec = 0;
    data.forEach(e => totalSec += e.duration);
    expSubtitle.textContent = `${data.length} Einträge • ${formatDuration(totalSec)}`;
  }

  expTicketFilter.addEventListener('change', updateExportSubtitle);
  expSortNewest.addEventListener('change', updateExportSubtitle);

  btnOpenExport.onclick = () => {
    if (filteredData.length === 0) return alert('Keine Daten im aktuellen Filter.');

    const tickets = new Set();
    filteredData.forEach(e => { if(e.ticket) tickets.add(e.ticket.trim()); });
    expTicketFilter.innerHTML = '<option value="">Alle Ticketnummern</option>';
    Array.from(tickets).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      expTicketFilter.appendChild(opt);
    });

    updateExportSubtitle();
    updateExportFilename();
    modalExport.style.display = 'flex';
  };

  btnCloseExport.onclick = () => modalExport.style.display = 'none';

  function getRoundedDuration(durationSec) {
    const rMin = parseInt(settingsData.rounding || '0');
    if (rMin === 0) return durationSec;
    const rSec = rMin * 60;
    return Math.ceil(durationSec / rSec) * rSec;
  }

  btnDoExport.onclick = () => {
    const data = getExportFilteredData();
    if (data.length === 0) return alert('Keine Daten für diesen Export.');

    const timesOnly = expTimesOnly.checked;
    const showDate = expShowDate.checked;
    const doRound = parseInt(settingsData.rounding || '0') > 0;

    if (currentExportFormat === 'csv') doCsvExport(data, timesOnly, doRound);
    else if (currentExportFormat === 'pdf') doPdfExport(data, timesOnly, doRound, showDate);
    else if (currentExportFormat === 'md') doMarkdownExport(data, timesOnly, doRound, showDate);
  };

  function doCsvExport(data, timesOnly, doRound) {
    let csv = '\uFEFF';
    csv += timesOnly ? 'Datum;Start;Ende;Dauer (Sek)\n' : 'Datum;Start;Ende;Ticket;Tätigkeit;Tags;Dauer (Sek)\n';

    data.forEach(entry => {
      const date = new Date(entry.startTime).toLocaleDateString('de-DE');
      const start = formatTime(new Date(entry.startTime));
      const end = formatTime(new Date(entry.endTime));
      const dur = doRound ? getRoundedDuration(entry.duration) : entry.duration;

      if (timesOnly) {
        csv += `${date};${start};${end};${dur}\n`;
      } else {
        const ticket = (entry.ticket || '').replace(/"/g, '""');
        const task = (entry.task || '').replace(/"/g, '""');
        const tags = (entry.tags || '').replace(/"/g, '""');
        csv += `${date};${start};${end};"${ticket}";"${task}";"${tags}";${dur}\n`;
      }
    });

    downloadBlob(csv, 'text/csv;charset=utf-8', expFilename.textContent);
  }

  function doPdfExport(data, timesOnly, doRound, showDate) {
    if (!window.jspdf) return alert('jsPDF Library konnte nicht geladen werden.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const primaryColor = settingsData.pdfColor || '#4f46e5';

    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 40, 'F');

    const imgEl = document.getElementById('setLogoPreview');
    if (settingsData.logoBase64) {
      doc.addImage(settingsData.logoBase64, 'PNG', 14, 12, 36, 12);
    } else if (imgEl && imgEl.complete && imgEl.naturalHeight !== 0) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = imgEl.naturalWidth || imgEl.width;
        canvas.height = imgEl.naturalHeight || imgEl.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgEl, 0, 0);
        doc.addImage(canvas.toDataURL("image/png"), 'PNG', 14, 12, 36, 12);
      } catch (e) {
        console.log('Error adding default logo', e);
      }
    }

    doc.setFontSize(22);
    doc.setTextColor(primaryColor);
    doc.setFont("helvetica", "bold");
    doc.text('Leistungsnachweis', 196, 22, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont("helvetica", "normal");

    let subY = 28;
    if (settingsData.name) {
        doc.text(`Erstellt von: ${settingsData.name}`, 196, subY, { align: 'right' });
        subY += 6;
    }
    doc.text(`Zeitraum: ${hdrCurrentPeriodLabel.textContent}`, 196, subY, { align: 'right' });

    doc.setDrawColor(primaryColor);
    doc.setLineWidth(1.5);
    doc.line(14, 40, 196, 40);

    let startY = 50;

    let totalSec = 0;
    const ticketTotals = {};
    data.forEach(e => {
        const dur = doRound ? getRoundedDuration(e.duration) : e.duration;
        totalSec += dur;
        const tk = e.ticket || 'Ohne Ticket';
        ticketTotals[tk] = (ticketTotals[tk] || 0) + dur;
    });

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(230, 230, 230);
    doc.rect(14, startY, 182, 25, 'FD');

    doc.setFontSize(12);
    doc.setTextColor(50);
    doc.setFont("helvetica", "bold");
    doc.text('Zusammenfassung', 18, startY + 8);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Gesamtdauer:`, 18, startY + 16);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatDuration(totalSec)}`, 50, startY + 16);

    doc.setFont("helvetica", "normal");
    doc.text(`Anzahl Tickets: ${Object.keys(ticketTotals).length}`, 18, startY + 22);
    doc.text(`Einträge: ${data.length}`, 80, startY + 22);

    startY += 35;

    const head = timesOnly ? [['DATUM', 'ZEIT', 'DAUER']] : [['DATUM', 'ZEIT', 'TICKET', 'BESCHREIBUNG', 'TÄTIGKEIT', 'DAUER']];
    const tableData = data.map(entry => {
      const date = new Date(entry.startTime).toLocaleDateString('de-DE');
      const start = formatTime(new Date(entry.startTime));
      const end = formatTime(new Date(entry.endTime));
      const dur = doRound ? getRoundedDuration(entry.duration) : entry.duration;

      if (timesOnly) return [date, `${start} - ${end}`, formatDuration(dur)];
      return [date, `${start} - ${end}`, entry.ticket || '-', entry.descShort || '-', entry.task || '-', formatDuration(dur)];
    });

    const colStyles = timesOnly ? { 2: { halign: 'right' } } : { 5: { halign: 'right' } };

    doc.autoTable({
      startY: startY,
      head: head,
      body: tableData,
      theme: 'grid',
      headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          cellPadding: 3
      },
      styles: {
          fontSize: 9,
          cellPadding: 3,
          lineColor: [226, 232, 240],
          lineWidth: 0.1
      },
      alternateRowStyles: {
          fillColor: [248, 250, 252]
      },
      columnStyles: colStyles,
      foot: [[
        { content: 'Gesamtdauer', colSpan: timesOnly ? 2 : 5, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatDuration(totalSec), styles: { fontStyle: 'bold', halign: 'right', textColor: primaryColor } }
      ]],
      footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineWidth: { top: 0.5 },
          lineColor: primaryColor
      },
      didDrawPage: function (dt) {
        if (showDate) {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Generiert am ${new Date().toLocaleString('de-DE')} von eZTimeTracker`, dt.settings.margin.left, doc.internal.pageSize.height - 10);
            doc.text(`Seite ${doc.internal.getNumberOfPages()}`, doc.internal.pageSize.width - dt.settings.margin.right - 10, doc.internal.pageSize.height - 10, { align: 'right' });
        }
      }
    });

    doc.save(expFilename.textContent);
    modalExport.style.display = 'none';
  }

  function doMarkdownExport(data, timesOnly, doRound, showDate) {
    let md = '';
    let overallTotal = 0;

    const byTicket = {};
    data.forEach(e => {
        const t = e.ticket || 'Ohne Ticket';
        if(!byTicket[t]) byTicket[t] = [];
        byTicket[t].push(e);
        overallTotal += (doRound ? getRoundedDuration(e.duration) : e.duration);
    });

    Object.keys(byTicket).forEach(t => {
      const tData = byTicket[t];
      let tTotal = 0;
      tData.forEach(e => tTotal += (doRound ? getRoundedDuration(e.duration) : e.duration));

      md += `## ⏱️ Zeiterfassung (${t})\n\n`;
      md += `**Ticket-ID:** \`${t}\`  \n`;
      md += `**Gesamtdauer:** \`${formatDuration(tTotal)}\`\n\n`;
      md += `### 📋 Tätigkeiten\n`;

      tData.forEach(e => {
         const dur = doRound ? getRoundedDuration(e.duration) : e.duration;
         const taskText = e.task || 'Keine Angabe';
         if (timesOnly) {
            md += `* **${new Date(e.startTime).toLocaleDateString('de-DE')} ${formatTime(new Date(e.startTime))}-${formatTime(new Date(e.endTime))}** — \`${formatDuration(dur)}\`\n`;
         } else {
            md += `* **${taskText}** — \`${formatDuration(dur)}\`\n`;
         }
      });
      md += `\n---\n\n`;
    });

    if (showDate) {
      md += `\n**Gesamtdauer gefiltert:** \`${formatDuration(overallTotal)}\`\n`;
    }

    navigator.clipboard.writeText(md).then(() => {
        const origText = btnDoExport.innerHTML;
        btnDoExport.innerHTML = '✅ Kopiert!';
        btnDoExport.style.background = '#10b981';
        setTimeout(() => {
            btnDoExport.innerHTML = origText;
            btnDoExport.style.background = 'var(--primary)';
        }, 2000);
    }).catch(err => {
        alert('Kopieren fehlgeschlagen: ' + err);
    });
  }

  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    modalExport.style.display = 'none';
  }

  tabVerlauf.addEventListener('click', () => {
    tabVerlauf.classList.add('active');
    tabTickets.classList.remove('active');
    viewVerlaufMain.style.display = 'flex';
    viewTicketsMain.style.display = 'none';
    topActionsVerlauf.style.display = 'flex';
  });

  tabTickets.addEventListener('click', () => {
    tabTickets.classList.add('active');
    tabVerlauf.classList.remove('active');
    viewTicketsMain.style.display = 'flex';
    viewVerlaufMain.style.display = 'none';
    topActionsVerlauf.style.display = 'none';
  });

  if (btnImportCsv && fileImportCsv) {
    btnImportCsv.onclick = () => fileImportCsv.click();
    fileImportCsv.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const parsed = parseTicketsCSV(event.target.result);
          if (parsed && parsed.length > 0) {
             ticketsData = parsed;
             await chrome.storage.local.set({ ttTickets: ticketsData });
             renderTickets();
          } else {
             alert('Es konnten keine Tickets gefunden werden. Ist das Format korrekt?');
          }
        } catch (err) {
          alert('Fehler beim Parsen der Datei: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function parseTicketsCSV(text) {
    let result = [];
    let headers = [];
    let isHeader = true;
    let row = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = i + 1 < text.length ? text[i + 1] : '';

        if (c === '"') {
            if (inQuotes && next === '"') {
                currentValue += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push(currentValue.trim());
            currentValue = '';
        } else if (c === '\n' && !inQuotes) {
            row.push(currentValue.trim());
            currentValue = '';

            if (isHeader) {
                headers = row.map(h => h.replace(/\r/g, ''));
                isHeader = false;
            } else if (row.length > 1) {
                let obj = {};
                row.forEach((val, index) => {
                    if (headers[index]) obj[headers[index]] = val.replace(/\r/g, '');
                });
                result.push(obj);
            }
            row = [];
        } else {
            currentValue += c;
        }
    }

    if (currentValue || row.length > 0) {
        row.push(currentValue.trim());
        if (!isHeader && row.length > 1) {
            let obj = {};
            row.forEach((val, index) => {
                if (headers[index]) obj[headers[index]] = val.replace(/\r/g, '');
            });
            result.push(obj);
        }
    }
    return result;
  }

  function parseYoutrackDate(dateStr) {
    if (!dateStr) return null;

    const monthsMap = {
      'jan.': '01', 'feb.': '02', 'märz': '03', 'apr.': '04', 'mai': '05', 'juni': '06',
      'juli': '07', 'aug.': '08', 'sept.': '09', 'okt.': '10', 'nov.': '11', 'dez.': '12',
      'sep.': '09', 'mar.': '03', 'oct.': '10', 'dec.': '12'
    };

    let str = dateStr.toLowerCase().trim();

    for (const [name, num] of Object.entries(monthsMap)) {
      if (str.includes(name)) {
        str = str.replace(name, num);
        break;
      }
    }

    const parts = str.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+):(\d+)/);
    if (parts) {
      const [_, day, month, year, hours, minutes] = parts;
      const d = new Date(year, parseInt(month)-1, day, hours, minutes);
      if (!isNaN(d.getTime())) return d.getTime();
    }

    const fallback = Date.parse(dateStr);
    return isNaN(fallback) ? null : fallback;
  }

  function renderTickets() {
    if (!ticketsListEl) return;
    ticketsListEl.innerHTML = '';

    const currentStateFilter = selTicketState ? selTicketState.value : 'all';
    if (selTicketState) {
       ticketsStates.clear();
       ticketsData.forEach(t => { if (t['State']) ticketsStates.add(t['State']); });

       let optionsHtml = '<option value="all">Alle Status</option>';
       Array.from(ticketsStates).sort().forEach(state => {
         optionsHtml += `<option value="${state}" ${currentStateFilter === state ? 'selected' : ''}>${state}</option>`;
       });
       selTicketState.innerHTML = optionsHtml;
    }

    if (ticketsData.length === 0) {
        ticketsListEl.innerHTML = '<div style="color: var(--text-muted); font-size: 14px;">Keine Tickets vorhanden. Importiere eine CSV-Datei.</div>';
        return;
    }

    let filtered = ticketsData;
    const searchVal = (inpTicketSearch ? inpTicketSearch.value : '').toLowerCase().trim();
    if (searchVal) {
      filtered = filtered.filter(t => {
        const text = ((t['Ticket-ID'] || '') + ' ' + (t['Zusammenfassung'] || '') + ' ' + (t['Beschreibung'] || '')).toLowerCase();
        return text.includes(searchVal);
      });
    }

    if (currentStateFilter !== 'all') {
      filtered = filtered.filter(t => t['State'] === currentStateFilter);
    }

    filtered.forEach(t => {
       if (t._dueTimestamp === undefined) {
         t._dueTimestamp = parseYoutrackDate(t['Fälligkeit']);
       }
    });

    const sortVal = selTicketSort ? selTicketSort.value : 'default';
    if (sortVal === 'due_asc') {
      filtered.sort((a, b) => {
        if (!a._dueTimestamp) return 1;
        if (!b._dueTimestamp) return -1;
        return a._dueTimestamp - b._dueTimestamp;
      });
    } else if (sortVal === 'due_desc') {
      filtered.sort((a, b) => {
        if (!a._dueTimestamp) return 1;
        if (!b._dueTimestamp) return -1;
        return b._dueTimestamp - a._dueTimestamp;
      });
    }

    const viewMode = settingsData.ticketViewMode || 'grid';

    if (viewMode === 'grid') {
        ticketsListEl.style.display = 'grid';
        ticketsListEl.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
        ticketsListEl.style.gap = '16px';
        ticketsListEl.style.alignContent = 'flex-start';
    } else if (viewMode === 'list') {
        ticketsListEl.style.display = 'flex';
        ticketsListEl.style.flexDirection = 'column';
        ticketsListEl.style.gap = '8px';
        ticketsListEl.style.alignContent = 'stretch';
    } else if (viewMode === 'table') {
        ticketsListEl.style.display = 'block';
    }

    if (filtered.length === 0) {
       ticketsListEl.innerHTML = '<div style="color: var(--text-muted); font-size: 14px;">Keine Tickets gefunden für diesen Filter.</div>';
       return;
    }

    if (viewMode === 'table') {
        let tableHtml = `
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th style="width: 15%">TICKET-ID</th>
                  <th style="width: 40%">ZUSAMMENFASSUNG</th>
                  <th style="width: 15%">ASSIGNEE</th>
                  <th style="width: 10%">STATUS</th>
                  <th style="width: 15%">FÄLLIGKEIT</th>
                  <th style="width: 5%"></th>
                </tr>
              </thead>
              <tbody id="ticketsTableBody"></tbody>
            </table>
          </div>
        `;
        ticketsListEl.innerHTML = tableHtml;
        const tbody = ticketsListEl.querySelector('#ticketsTableBody');

        filtered.forEach(ticket => {
            const id = ticket['Ticket-ID'] || 'Unbekannt';
            const title = ticket['Zusammenfassung'] || 'Ohne Titel';
            const assignee = ticket['Assignee'] || '-';
            const state = ticket['State'] || '-';
            const due = ticket['Fälligkeit'] || '-';

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';

            if (ticket._dueTimestamp) {
              const diffHours = (ticket._dueTimestamp - Date.now()) / (1000 * 60 * 60);
              if (diffHours < 0) tr.style.borderLeft = '4px solid #ef4444';
              else if (diffHours <= 48) tr.style.borderLeft = '4px solid #f59e0b';
            }

            tr.innerHTML = `
                <td><span style="font-weight:700; color:var(--primary); font-size:11px;">${id}</span></td>
                <td style="font-weight:600; color:var(--text-main);">${title}</td>
                <td>${assignee}</td>
                <td><span style="background:var(--border-color); padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">${state}</span></td>
                <td>${due}</td>
                <td style="text-align:right;">
                  <button class="ticket-delete-btn" style="position:static; opacity:0.5;" title="Ticket löschen">&#10005;</button>
                </td>
            `;

            tr.onclick = (e) => {
                if (e.target.tagName !== 'BUTTON') openTicketDetail(ticket);
            };

            const btnDelete = tr.querySelector('.ticket-delete-btn');
            btnDelete.onmouseover = () => btnDelete.style.color = '#ef4444';
            btnDelete.onmouseout = () => btnDelete.style.color = '';
            btnDelete.onclick = async (e) => {
               e.stopPropagation();
               const tIdx = ticketsData.indexOf(ticket);
               if (tIdx > -1) {
                 ticketsData.splice(tIdx, 1);
                 await chrome.storage.local.set({ ttTickets: ticketsData });
                 renderTickets();
               }
            };

            tbody.appendChild(tr);
        });
    } else {

        filtered.forEach(ticket => {
            const id = ticket['Ticket-ID'] || 'Unbekannt';
            const title = ticket['Zusammenfassung'] || 'Ohne Titel';
            const assignee = ticket['Assignee'] || '-';
            const state = ticket['State'] || '-';

            const card = document.createElement('div');
            card.className = 'ticket-card' + (viewMode === 'list' ? ' list-mode' : '');

            if (ticket._dueTimestamp) {
              const now = Date.now();
              const diffHours = (ticket._dueTimestamp - now) / (1000 * 60 * 60);
              if (diffHours < 0) {
                card.classList.add('ticket-overdue');
              } else if (diffHours <= 48) {
                card.classList.add('ticket-due-soon');
              }
            }

            card.innerHTML = `
              <button class="ticket-delete-btn" title="Ticket löschen">&#10005;</button>
              <div class="ticket-card-id">${id}</div>
              <div class="ticket-card-title" title="${title}">${title}</div>
              <div class="ticket-card-meta">
                <span>👤 ${assignee}</span>
                <span>📌 ${state}</span>
              </div>
            `;

            const btnDelete = card.querySelector('.ticket-delete-btn');
            btnDelete.onclick = async (e) => {
               e.stopPropagation();
               const idx = ticketsData.indexOf(ticket);
               if (idx > -1) {
                 ticketsData.splice(idx, 1);
                 await chrome.storage.local.set({ ttTickets: ticketsData });
                 renderTickets();
               }
            };

            card.onclick = () => openTicketDetail(ticket);
            ticketsListEl.appendChild(card);
        });
    }
  }

  if (inpTicketSearch) inpTicketSearch.addEventListener('input', renderTickets);
  if (selTicketState) selTicketState.addEventListener('change', renderTickets);
  if (selTicketSort) selTicketSort.addEventListener('change', renderTickets);

  const btnViewGrid = document.getElementById('btnViewGrid');
  const btnViewList = document.getElementById('btnViewList');
  const btnViewTable = document.getElementById('btnViewTable');

  function updateViewButtons() {
      if (btnViewGrid) btnViewGrid.classList.toggle('active', settingsData.ticketViewMode === 'grid');
      if (btnViewList) btnViewList.classList.toggle('active', settingsData.ticketViewMode === 'list');
      if (btnViewTable) btnViewTable.classList.toggle('active', settingsData.ticketViewMode === 'table');
  }

  function setTicketViewMode(mode) {
      settingsData.ticketViewMode = mode;
      chrome.storage.local.set({ ttSettings: settingsData });
      updateViewButtons();
      renderTickets();
  }

  if (btnViewGrid) btnViewGrid.onclick = () => setTicketViewMode('grid');
  if (btnViewList) btnViewList.onclick = () => setTicketViewMode('list');
  if (btnViewTable) btnViewTable.onclick = () => setTicketViewMode('table');

  function stripHtml(html) {
      if (!html) return '';
      if (!html.includes('<')) return html;
      let doc = new DOMParser().parseFromString(html, 'text/html');
      const styles = doc.querySelectorAll('style');
      styles.forEach(s => s.remove());
      return doc.body.textContent || "";
  }

  function openTicketDetail(ticket) {
    currentActiveTicket = ticket;
    const id = ticket['Ticket-ID'] || 'Unbekannt';
    const reporter = ticket['Melder'] || 'Unbekannt';
    const created = ticket['Erstellt'] || 'Unbekannt';

    document.getElementById('tdMeta').textContent = `Erstellt von ${reporter} am ${created}`;
    document.getElementById('tdSummary').textContent = `${id}: ${ticket['Zusammenfassung'] || 'Ohne Titel'}`;

    const descEl = document.getElementById('tdDescription');
    if (ticket['Beschreibung']) {
        descEl.textContent = stripHtml(ticket['Beschreibung']).trim();
    } else {
        descEl.innerHTML = '<i>Keine Beschreibung vorhanden.</i>';
    }

    document.getElementById('tdProject').textContent = ticket['Projekt'] || '-';
    document.getElementById('tdType').textContent = ticket['Type'] || '-';
    document.getElementById('tdPriority').textContent = ticket['Priority'] || '-';
    document.getElementById('tdState').textContent = ticket['State'] || '-';
    document.getElementById('tdAssignee').textContent = ticket['Assignee'] || '-';
    document.getElementById('tdDue').textContent = ticket['Fälligkeit'] || '-';

    modalTicketDetail.style.display = 'flex';
  }

  if (btnCloseTicketDetail) {
    btnCloseTicketDetail.onclick = () => {
      modalTicketDetail.style.display = 'none';
      currentActiveTicket = null;
    };
  }

  if (btnBookTicket) {
    btnBookTicket.onclick = () => {
      if (!currentActiveTicket) return;
      modalTicketDetail.style.display = 'none';
      tabVerlauf.click();

      tabLive.click();

      inpTicket.value = currentActiveTicket['Ticket-ID'] || '';
      inpDescShort.value = currentActiveTicket['Zusammenfassung'] || '';
      inpTags.value = currentActiveTicket['Type'] || '';
      inpNotes.value = currentActiveTicket['Projekt'] || '';
      inpTask.value = '';

      saveCurrentInputs();

      chrome.storage.local.get('ttActive', (data) => {
        if (data.ttActive) {
            stopCurrentTimer(true).then(() => startTimer());
        } else {
            startTimer();
        }
      });
    };
  }

  loadData();
});
