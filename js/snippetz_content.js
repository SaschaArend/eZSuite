(function () {
  let snippetsCache = [];
  let globalVarsCache = {};
  let isSnippetzEnabled = true;

  function loadStorageCache() {
    chrome.storage.local.get(['ezSnippetzData', 'ezSnippetzGlobalVars', 'snippets', 'globalVars', 'ezSuiteConfig'], (res) => {

      snippetsCache = (res.ezSnippetzData || res.snippets || []).filter(s => !s.isDeleted);
      globalVarsCache = res.ezSnippetzGlobalVars || res.globalVars || {};
      if (res.ezSuiteConfig && res.ezSuiteConfig.snippetz === false) {
        isSnippetzEnabled = false;
      } else {
        isSnippetzEnabled = true;
      }
    });
  }

  loadStorageCache();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.ezSnippetzData) snippetsCache = (changes.ezSnippetzData.newValue || []).filter(s => !s.isDeleted);
      if (changes.ezSnippetzGlobalVars) globalVarsCache = changes.ezSnippetzGlobalVars.newValue || {};
      if (changes.ezSuiteConfig) {
        isSnippetzEnabled = !(changes.ezSuiteConfig.newValue && changes.ezSuiteConfig.newValue.snippetz === false);
      }
    }
  });

  function getSnippetText(snippet) {
    if (snippet.blocks && Array.isArray(snippet.blocks) && snippet.blocks.length > 0) {
      return snippet.blocks.map(b => b.content).join('\n\n');
    }
    return snippet.content || '';
  }

  function extractVariablesDetailed(text) {
    const regex = /\$?\{([^}]+)\}/g;
    const variables = [];
    const seen = new Set();

    let match;
    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const isDollar = fullMatch.startsWith('${');
      const raw = match[1].trim();

      let name = raw;
      let defaultValue = '';
      let options = [];
      let isMultiline = false;
      let transform = null;

      const lower = raw.toLowerCase();
      if (
        lower === 'clipboard' ||
        lower.startsWith('datum') ||
        lower === 'tab' ||
        lower === 'enter' ||
        lower.startsWith('snippet:') ||
        raw.startsWith('#if ') ||
        raw === '/if'
      ) {
        continue;
      }

      if (Object.keys(globalVarsCache).some(k => k.toLowerCase() === lower)) {
        continue;
      }

      if (raw.includes('=[')) {
        const parts = raw.split('=[');
        name = parts[0].trim();
        const optStr = parts[1].replace(']', '');
        options = optStr.split(',').map(o => o.trim()).filter(Boolean);
      } else if (raw.includes('=')) {
        const parts = raw.split('=');
        name = parts[0].trim();
        defaultValue = parts.slice(1).join('=').trim();
      } else if (lower.endsWith(':multiline')) {
        name = raw.substring(0, raw.length - 10).trim();
        isMultiline = true;
      } else if (lower.endsWith(':uppercase')) {
        name = raw.substring(0, raw.length - 10).trim();
        transform = 'uppercase';
      } else if (lower.endsWith(':lowercase')) {
        name = raw.substring(0, raw.length - 10).trim();
        transform = 'lowercase';
      } else if (isDollar && raw.includes(':')) {
        const parts = raw.split(':');
        name = parts[0].trim();
        defaultValue = parts.slice(1).join(':').trim();
      }

      if (!isDollar && name.startsWith(':')) continue;

      if (!seen.has(name)) {
        seen.add(name);
        variables.push({ fullMatch, raw, name, defaultValue, options, isMultiline, transform });
      }
    }
    return variables;
  }

  function processNestedSnippets(text, depth = 0) {
    if (depth > 5) return text;
    let out = text.replace(/\{Snippet:([^}]+)\}/gi, (m, title) => {
      const found = snippetsCache.find(s => !s.isDeleted && (s.title || '').toLowerCase() === title.trim().toLowerCase());
      return found ? processNestedSnippets(getSnippetText(found), depth + 1) : m;
    });
    out = out.replace(/\[\[([^\]]+)\]\]/g, (m, title) => {
      const found = snippetsCache.find(s => !s.isDeleted && (s.title || '').toLowerCase() === title.trim().toLowerCase());
      return found ? processNestedSnippets(getSnippetText(found), depth + 1) : m;
    });
    return out;
  }

  function generateFinalContent(rawText, inputValues, clipboardText) {
    let finalContent = processNestedSnippets(rawText);

    for (const [key, val] of Object.entries(globalVarsCache)) {
      const r = new RegExp(`\\$?\\{${key}\\}`, 'gi');
      finalContent = finalContent.replace(r, val);
    }

    finalContent = finalContent.replace(/\{Datum([+-]\d+)?\}/gi, (match, offset) => {
      const d = new Date();
      if (offset) d.setDate(d.getDate() + parseInt(offset, 10));
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    });

    finalContent = finalContent.replace(/\{clipboard\}/gi, clipboardText || '');

    const variables = extractVariablesDetailed(finalContent);
    variables.forEach(v => {
      let replacement = inputValues[v.name] !== undefined ? inputValues[v.name] : (v.defaultValue || '');
      if (v.transform === 'uppercase') replacement = replacement.toUpperCase();
      if (v.transform === 'lowercase') replacement = replacement.toLowerCase();

      finalContent = finalContent.split(v.fullMatch).join(replacement);
      finalContent = finalContent.split(`{${v.name}}`).join(replacement);
      finalContent = finalContent.split(`\${${v.name}}`).join(replacement);
    });

    const ifRegex = /\{#if\s+([^}]+)\}([\s\S]*?)\{\/if\}/g;
    finalContent = finalContent.replace(ifRegex, (match, varName, content) => {
      const val = inputValues[varName.trim()];
      return (val && val.trim() !== '') ? content : '';
    });

    return finalContent;
  }

  let modalContainer = null;
  let currentTargetEl = null;
  let savedSelectionRange = null;

  function insertTextAtCursor(targetEl, text, replaceLength = 0) {
    if (!targetEl) return;
    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      const start = targetEl.selectionStart || 0;
      const end = targetEl.selectionEnd || 0;
      const value = targetEl.value || '';
      const safeStart = Math.max(0, start - replaceLength);
      targetEl.value = value.substring(0, safeStart) + text + value.substring(end);
      targetEl.selectionStart = targetEl.selectionEnd = safeStart + text.length;
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (targetEl.isContentEditable || document.designMode === 'on') {
      targetEl.focus();
      if (savedSelectionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelectionRange);
      }
      if (replaceLength > 0) {
        const sel = window.getSelection();
        for (let i = 0; i < replaceLength; i++) {
          sel.modify('extend', 'backward', 'character');
        }
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          if (!document.execCommand('insertLineBreak', false, null)) {
            document.execCommand('insertParagraph', false, null);
          }
        }
        if (lines[i].length > 0) {
          document.execCommand('insertText', false, lines[i]);
        }
      }
    }
  }

  function closePopup() {
    if (modalContainer) {
      modalContainer.remove();
      modalContainer = null;
      if (currentTargetEl) currentTargetEl.focus();
      currentTargetEl = null;
      savedSelectionRange = null;
    }
  }

  async function openExpanderModal(targetEl, preselectedSnippet = null, replaceLen = 2) {
    if (modalContainer) return;
    currentTargetEl = targetEl;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRange = sel.getRangeAt(0).cloneRange();
    }

    let clipboardData = '';
    try {
      clipboardData = await navigator.clipboard.readText();
    } catch (e) {}

    modalContainer = document.createElement('div');
    modalContainer.id = 'ezsnippetz-expander-root';
    modalContainer.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(2px);
      display: flex; justify-content: center; align-items: center;
      z-index: 2147483647; font-family: system-ui, -apple-system, sans-serif;
    `;

    const shadow = modalContainer.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      .modal {
        background: #ffffff; width: 420px; max-width: 92vw;
        border-radius: 14px; box-shadow: 0 15px 35px rgba(0,0,0,0.2);
        display: flex; flex-direction: column; overflow: hidden;
        border: 1px solid #e2e8f0;
      }
      .header {
        background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        padding: 12px 16px; color: #ffffff;
        display: flex; justify-content: space-between; align-items: center;
      }
      .header h2 { margin: 0; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
      .close-btn { background: none; border: none; font-size: 18px; color: rgba(255,255,255,0.8); cursor: pointer; }
      .close-btn:hover { color: #ffffff; }
      .view { display: none; padding: 14px; max-height: 65vh; overflow-y: auto; }
      .view.active { display: flex; flex-direction: column; }
      input, select, textarea {
        width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1;
        border-radius: 8px; font-size: 13px; margin-bottom: 10px;
        font-family: inherit; background: #ffffff; color: #0f172a;
      }
      input:focus, select:focus, textarea:focus {
        outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.15);
      }
      label { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 4px; display: block; text-transform: uppercase; }
      .snippet-list { display: flex; flex-direction: column; gap: 6px; }
      .snippet-btn {
        background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px;
        border-radius: 8px; text-align: left; cursor: pointer; font-size: 13px;
        color: #0f172a; font-weight: 600; display: flex; justify-content: space-between; align-items: center;
      }
      .snippet-btn:hover, .snippet-btn:focus { border-color: #6366f1; background: #eff6ff; outline: none; }
      .snippet-cat { font-size: 10px; color: #6366f1; background: #e0e7ff; padding: 2px 6px; border-radius: 4px; }
      .preview-box {
        background: #0f172a; color: #f8fafc; font-family: monospace; font-size: 11.5px;
        padding: 8px 10px; border-radius: 6px; margin-bottom: 10px; max-height: 100px; overflow-y: auto; white-space: pre-wrap;
      }
      .primary-btn {
        background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        color: white; border: none; padding: 10px;
        border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; font-size: 13px;
      }
    `;
    shadow.appendChild(style);

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `<h2>⚡ eZSnippetZ Einfügen</h2><button class="close-btn">&times;</button>`;
    modal.appendChild(header);

    const listView = document.createElement('div');
    listView.className = 'view active';
    listView.innerHTML = `<input type="text" id="search" placeholder="Snippet suchen (Pfeiltasten + Enter)..." autocomplete="off">`;
    const listContainer = document.createElement('div');
    listContainer.className = 'snippet-list';
    listView.appendChild(listContainer);
    modal.appendChild(listView);

    const fillView = document.createElement('div');
    fillView.className = 'view';
    modal.appendChild(fillView);

    shadow.appendChild(modal);
    document.body.appendChild(modalContainer);

    const searchInput = shadow.getElementById('search');

    function renderList(q = '') {
      listContainer.innerHTML = '';
      const activeSnippets = snippetsCache.filter(s => !s.isDeleted && (s.title || '').toLowerCase().includes(q.toLowerCase()));
      activeSnippets.slice(0, 25).forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'snippet-btn';
        const cat = s._path && s._path !== 'Root' ? s._path : (s.category || 'Allgemein');
        btn.innerHTML = `<span>${s.favorite ? '⭐ ' : ''}${s.title}</span><span class="snippet-cat">${cat}</span>`;
        btn.onclick = () => selectSnippet(s);
        listContainer.appendChild(btn);
      });
    }

    searchInput.addEventListener('input', (e) => renderList(e.target.value));

    listView.addEventListener('keydown', (e) => {
      const buttons = Array.from(listContainer.querySelectorAll('.snippet-btn'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (buttons.length === 0) return;
        const idx = buttons.indexOf(shadow.activeElement);
        if (e.key === 'ArrowDown') {
          if (idx < buttons.length - 1) buttons[idx + 1].focus();
          else if (idx === -1) buttons[0].focus();
        } else {
          if (idx > 0) buttons[idx - 1].focus();
          else searchInput.focus();
        }
      } else if (e.key === 'Enter' && shadow.activeElement === searchInput) {
        e.preventDefault();
        if (buttons[0]) buttons[0].click();
      }
    });

    shadow.querySelector('.close-btn').onclick = closePopup;
    modalContainer.addEventListener('mousedown', (e) => {
      if (e.composedPath()[0] === modalContainer) closePopup();
    });

    ['keydown', 'keyup', 'keypress', 'input'].forEach(evt => {
      modalContainer.addEventListener(evt, (e) => {
        if (evt === 'keydown' && e.key === 'Escape') closePopup();
        e.stopPropagation();
      });
    });

    function selectSnippet(snippet) {
      const rawText = getSnippetText(snippet);
      const variables = extractVariablesDetailed(rawText);

      if (variables.length === 0) {
        const finalStr = generateFinalContent(rawText, {}, clipboardData);
        insertTextAtCursor(currentTargetEl, finalStr, replaceLen);
        closePopup();
        return;
      }

      listView.classList.remove('active');
      fillView.classList.add('active');
      fillView.innerHTML = `<div style="font-weight:700; font-size:13.5px; margin-bottom:10px; color:#1e293b;">${snippet.title}</div>`;

      const inputNodes = [];
      const fieldsWrap = document.createElement('div');

      const previewBox = document.createElement('div');
      previewBox.className = 'preview-box';

      const updatePreview = () => {
        const vals = {};
        inputNodes.forEach(n => { vals[n.dataset.varName] = n.value; });
        previewBox.textContent = generateFinalContent(rawText, vals, clipboardData);
      };

      variables.forEach(v => {
        const group = document.createElement('div');
        group.innerHTML = `<label>${v.name}</label>`;
        let input;
        if (v.options && v.options.length > 0) {
          input = document.createElement('select');
          v.options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            input.appendChild(o);
          });
          input.onchange = updatePreview;
        } else if (v.isMultiline) {
          input = document.createElement('textarea');
          input.rows = 3;
          input.oninput = updatePreview;
        } else {
          input = document.createElement('input');
          input.type = 'text';
          if (v.defaultValue) input.value = v.defaultValue;
          input.oninput = updatePreview;
        }
        input.dataset.varName = v.name;
        inputNodes.push(input);
        group.appendChild(input);
        fieldsWrap.appendChild(group);
      });

      fillView.appendChild(fieldsWrap);
      const prevLabel = document.createElement('label');
      prevLabel.textContent = 'Live-Vorschau';
      fillView.appendChild(prevLabel);
      fillView.appendChild(previewBox);

      const submitBtn = document.createElement('button');
      submitBtn.className = 'primary-btn';
      submitBtn.textContent = '✨ Einfügen (Strg+Enter)';
      submitBtn.onclick = () => {
        const vals = {};
        inputNodes.forEach(n => { vals[n.dataset.varName] = n.value; });
        const finalStr = generateFinalContent(rawText, vals, clipboardData);
        insertTextAtCursor(currentTargetEl, finalStr, replaceLen);
        closePopup();
      };
      fillView.appendChild(submitBtn);

      fillView.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submitBtn.click();
        }
      };

      updatePreview();
      setTimeout(() => { if (inputNodes[0]) inputNodes[0].focus(); }, 50);
    }

    if (preselectedSnippet) {
      selectSnippet(preselectedSnippet);
    } else {
      renderList();
      setTimeout(() => searchInput.focus(), 50);
    }
  }

  function checkTrigger() {
    if (!isSnippetzEnabled || modalContainer) return;
    const el = document.activeElement;
    if (!el) return;

    let textBefore = '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.selectionStart !== null) {
        textBefore = el.value.substring(0, el.selectionStart);
      }
    } else if (el.isContentEditable || document.designMode === 'on') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
          textBefore = range.startContainer.textContent.substring(0, range.startOffset);
        }
      }
    } else {
      return;
    }

    if (textBefore.endsWith('//') && !textBefore.endsWith('://')) {
      openExpanderModal(el, null, 2);
    }
  }

  document.addEventListener('input', checkTrigger);

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'insertEzSnippetById' && document.activeElement) {
      const s = snippetsCache.find(item => String(item.id) === String(request.id));
      if (s) {
        openExpanderModal(document.activeElement, s, 0);
      }
    }
  });
})();
