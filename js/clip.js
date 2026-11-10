document.addEventListener('DOMContentLoaded', async () => {
  const mainInput = document.getElementById('mainInput');
  const textStats = document.getElementById('textStats');
  const btnPaste = document.getElementById('btnPaste');
  const btnClear = document.getElementById('btnClear');
  const btnCopyResult = document.getElementById('btnCopyResult');
  const historyList = document.getElementById('historyList');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const toast = document.getElementById('toast');

  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  function updateStats() {
    if (!mainInput || !textStats) return;
    const val = mainInput.value;
    const charCount = val.length;
    const wordCount = val.trim() ? val.trim().split(/\s+/).length : 0;
    const lineCount = val ? val.split(/\r\n|\r|\n/).length : 0;
    textStats.textContent = `${charCount} Zeichen • ${wordCount} Wörter • ${lineCount} Zeilen`;
  }

  if (mainInput) {
    mainInput.addEventListener('input', updateStats);
  }

  async function loadHistory() {
    const data = await chrome.storage.local.get('clipHistory');
    const items = data.clipHistory || [];
    renderHistory(items);
  }

  async function pushHistory(text) {
    if (!text || !text.trim()) return;
    const data = await chrome.storage.local.get('clipHistory');
    let items = data.clipHistory || [];

    items = items.filter(i => (typeof i === 'string' ? i : i.text) !== text);

    items.unshift({
      text: text,
      timestamp: Date.now()
    });

    if (items.length > 30) items = items.slice(0, 30);
    await chrome.storage.local.set({ clipHistory: items });
    renderHistory(items);
  }

  function renderHistory(items) {
    if (!historyList) return;
    if (!items || items.length === 0) {
      historyList.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 30px 10px;">Noch keine Clips vorhanden</div>';
      return;
    }

    historyList.innerHTML = '';
    items.forEach((item) => {
      const textVal = typeof item === 'string' ? item : item.text;
      const timeVal = typeof item === 'object' && item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      const card = document.createElement('div');
      card.className = 'history-item';

      const topRow = document.createElement('div');
      topRow.className = 'history-item-top';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'history-item-time';
      timeSpan.textContent = timeVal;

      const copyAction = document.createElement('span');
      copyAction.textContent = '📋';
      copyAction.style.cursor = 'pointer';
      copyAction.title = 'Direkt kopieren';
      copyAction.onclick = async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(textVal);
        showToast('📋 In Zwischenablage kopiert!');
      };

      topRow.appendChild(timeSpan);
      topRow.appendChild(copyAction);

      const preview = document.createElement('div');
      preview.className = 'history-item-text';
      preview.textContent = textVal;

      card.appendChild(topRow);
      card.appendChild(preview);

      card.onclick = () => {
        if (mainInput) {
          mainInput.value = textVal;
          updateStats();
          showToast('Eingefügt aus Verlauf');
        }
      };

      historyList.appendChild(card);
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      await chrome.storage.local.set({ clipHistory: [] });
      renderHistory([]);
      showToast('🗑️ Verlauf geleert');
    });
  }

  if (btnPaste) {
    btnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (mainInput) {
          mainInput.value = text;
          updateStats();
          showToast('📋 Aus Zwischenablage eingefügt!');
        }
      } catch (err) {
        showToast('❌ Zugriff auf Zwischenablage verweigert');
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (mainInput) {
        mainInput.value = '';
        updateStats();
      }
    });
  }

  if (btnCopyResult) {
    btnCopyResult.addEventListener('click', async () => {
      if (!mainInput || !mainInput.value) return;
      await navigator.clipboard.writeText(mainInput.value);
      await pushHistory(mainInput.value);
      showToast('✨ Kopiert & im Verlauf gesichert!');
    });
  }

  function applyTransformation(fn, successMsg = '✨ Transformiert!') {
    if (!mainInput) return;
    const current = mainInput.value;
    if (!current) return;
    try {
      const result = fn(current);
      mainInput.value = result;
      updateStats();
      pushHistory(result);
      showToast(successMsg);
    } catch (e) {
      showToast('❌ ' + (e.message || 'Fehler bei der Transformation'));
    }
  }

  const actStrip = document.getElementById('act-strip');
  if (actStrip) {
    actStrip.addEventListener('click', () => {
      applyTransformation(text => {
        return text
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
      }, '🧹 Text bereinigt!');
    });
  }

  const actUpper = document.getElementById('act-upper');
  if (actUpper) {
    actUpper.addEventListener('click', () => {
      applyTransformation(text => text.toUpperCase(), '🔠 UPPERCASE');
    });
  }

  const actLower = document.getElementById('act-lower');
  if (actLower) {
    actLower.addEventListener('click', () => {
      applyTransformation(text => text.toLowerCase(), '🔡 lowercase');
    });
  }

  const actTitle = document.getElementById('act-title');
  if (actTitle) {
    actTitle.addEventListener('click', () => {
      applyTransformation(text => {
        return text.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
      }, '📰 Title Case');
    });
  }

  const actCamel = document.getElementById('act-camel');
  if (actCamel) {
    actCamel.addEventListener('click', () => {
      applyTransformation(text => {
        return text
          .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
          .replace(/^(.)/, c => c.toLowerCase());
      }, '🐪 camelCase');
    });
  }

  const actSnake = document.getElementById('act-snake');
  if (actSnake) {
    actSnake.addEventListener('click', () => {
      applyTransformation(text => {
        return text
          .replace(/([a-z])([A-Z])/g, '$1_$2')
          .replace(/[-\s]+/g, '_')
          .toLowerCase();
      }, '🐍 snake_case');
    });
  }

  const actKebab = document.getElementById('act-kebab');
  if (actKebab) {
    actKebab.addEventListener('click', () => {
      applyTransformation(text => {
        return text
          .replace(/([a-z])([A-Z])/g, '$1-$2')
          .replace(/[_\s]+/g, '-')
          .toLowerCase();
      }, '🍢 kebab-case');
    });
  }

  const actJson = document.getElementById('act-json');
  if (actJson) {
    actJson.addEventListener('click', () => {
      applyTransformation(text => {
        try {
          const parsed = JSON.parse(text);
          if (text.includes('\n')) {
            return JSON.stringify(parsed);
          } else {
            return JSON.stringify(parsed, null, 2);
          }
        } catch (e) {
          throw new Error('Ungültiges JSON-Format');
        }
      }, '⚡ JSON formatiert!');
    });
  }

  const actUrl = document.getElementById('act-url');
  if (actUrl) {
    actUrl.addEventListener('click', () => {
      applyTransformation(text => {
        if (text.includes('%')) {
          return decodeURIComponent(text);
        } else {
          return encodeURIComponent(text);
        }
      }, '🌐 URL En/Decoded');
    });
  }

  const actBase64 = document.getElementById('act-base64');
  if (actBase64) {
    actBase64.addEventListener('click', () => {
      applyTransformation(text => {
        try {
          const decoded = atob(text.trim());
          if (/^[\x00-\x7F]*$/.test(decoded) && decoded.length > 0) {
            return decoded;
          }
        } catch (e) {}
        return btoa(unescape(encodeURIComponent(text)));
      }, '🔒 Base64 En/Decoded');
    });
  }

  const actSql = document.getElementById('act-sql');
  if (actSql) {
    actSql.addEventListener('click', () => {
      applyTransformation(text => {
        const lines = text
          .split(/[\r\n,]+/)
          .map(l => l.trim().replace(/^['"]|['"]$/g, ''))
          .filter(l => l.length > 0);
        return lines.map(l => `'${l}'`).join(', ');
      }, '🗄️ SQL Quoted');
    });
  }

  const actSort = document.getElementById('act-sort');
  if (actSort) {
    actSort.addEventListener('click', () => {
      applyTransformation(text => {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const unique = Array.from(new Set(lines)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        return unique.join('\n');
      }, '🔀 Sortiert & Bereinigt');
    });
  }

  const actBullet = document.getElementById('act-bullet');
  if (actBullet) {
    actBullet.addEventListener('click', () => {
      applyTransformation(text => {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const allBullets = lines.every(l => l.trim().startsWith('- ') || l.trim().startsWith('* '));
        if (allBullets) {
          return lines.map(l => l.trim().replace(/^[-*]\s+/, '')).join('\n');
        } else {
          return lines.map(l => `- ${l.trim().replace(/^[-*]\s+/, '')}`).join('\n');
        }
      }, '📝 Listen-Format');
    });
  }

  const actCsv = document.getElementById('act-csv');
  if (actCsv) {
    actCsv.addEventListener('click', () => {
      applyTransformation(text => {

        return text.split(/\r?\n/).map(line => {
          if (line.includes('\t')) return line.split('\t').join(',');
          if (line.includes(';')) return line.split(';').join(',');
          return line;
        }).join('\n');
      }, '📊 CSV Normalisiert');
    });
  }

  loadHistory();
  updateStats();
});
