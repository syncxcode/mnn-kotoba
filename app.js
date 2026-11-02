/* MNN Kotoba — vanilla JS, no build tools. */
(() => {
  'use strict';
  const REVEAL_MS = 2000;
  const COOLDOWN_MS = 10000;
  const FEEDBACK_MS = 10000;
  const DATA = window.MNN_KOTOBA || {};
  const $ = id => document.getElementById(id);
  const els = {
    chapter: $('chapterSelect'), search: $('searchInput'), listTab: $('listTab'), quizTab: $('quizTab'),
    listPanel: $('listPanel'), quizPanel: $('quizPanel'), total: $('wordTotal'), rows: $('vocabRows'),
    listTitle: $('listTitle'), listCount: $('listCount'), listEmpty: $('listEmpty'),
    quizTitle: $('quizTitle'), quizCount: $('quizCount'), progress: $('progressFill'),
    quizWork: $('quizWork'), quizEmpty: $('quizEmpty'), quizFinish: $('quizFinish'),
    quizKanji: $('quizKanji'), quizForm: $('quizForm'), quizAnswer: $('quizAnswer'),
    inputHint: $('inputHint'), check: $('checkAnswer'), restart: $('restartQuiz'),
    overlay: $('feedbackOverlay'), dialog: $('feedbackDialog'), feedbackSymbol: $('feedbackSymbol'),
    feedbackTitle: $('feedbackTitle'), feedbackDesc: $('feedbackDescription'), feedbackAttempts: $('feedbackAttempts')
  };
  const state = { chapter: 1, tab: 'list', query: '', quizItems: [], quizIndex: 0, mistakes: 0, composing: false, popupTimer: 0, popupAction: null, lastFocus: null };
  // Cooldowns persist for the page session even if search/bab/tab changes.
  const kanaCooldowns = new Map(); // key -> { revealUntil, cooldownUntil }
  const runningTimers = new Set();
  const kanaRegex = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\s]+$/u;
  const hasKanji = str => /\p{Script=Han}/u.test(str || '');
  const normalize = text => String(text || '').normalize('NFC').trim();
  const entries = chapter => Array.isArray(DATA[chapter]) ? DATA[chapter] : [];
  const itemKey = (chapter, index) => `${chapter}:${index}`;
  function refreshChapterOptions() {
    for (let chapter = 1; chapter <= 50; chapter++) {
      const opt = document.createElement('option');
      opt.value = chapter;
      opt.textContent = `Bab ${chapter} · ${entries(chapter).length} kata`;
      els.chapter.appendChild(opt);
    }
  }
  function safeNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP'; utterance.rate = .88;
      speechSynthesis.speak(utterance);
    } catch (_) { /* Audio is an optional browser capability. */ }
  }
  function createCell(value, extra) { return safeNode('div', `cell ${extra}`, value); }
  function renderList() {
    const chapter = state.chapter;
    const all = entries(chapter);
    const search = state.query.toLocaleLowerCase();
    const matched = all.map((item, idx) => ({ item, idx }))
      .filter(({item}) => [item.kana, item.kanji, item.arti].some(v => String(v || '').toLocaleLowerCase().includes(search)));
    els.listTitle.textContent = `Bab ${chapter} · Kotoba`;
    els.total.textContent = `${all.length} kata`;
    els.listCount.textContent = `${matched.length} dari ${all.length} kata`;
    els.listEmpty.hidden = matched.length !== 0;
    if (!matched.length) els.listEmpty.textContent = all.length ? 'Tidak ada kata yang cocok.' : 'Belum ada data kotoba pada bab ini.';
    els.rows.replaceChildren();
    const fragment = document.createDocumentFragment();
    matched.forEach(({item, idx}) => {
      const row = safeNode('div', 'vocab-row');
      row.setAttribute('role', 'row');
      const isKanji = hasKanji(item.kanji);
      const kanaCell = createCell('', isKanji ? 'cell--kana cell--blurred cell--interactive' : 'cell--kana');
      kanaCell.setAttribute('role', 'cell');
      const span = safeNode('span', 'kana-text', item.kana || '');
      kanaCell.appendChild(span);
      if (isKanji) {
        kanaCell.tabIndex = 0;
        kanaCell.setAttribute('role', 'button');
        const cd = safeNode('span', 'cooldown-track');
        kanaCell.appendChild(cd);
        const key = itemKey(chapter, idx);
        const activate = () => revealKana(key, kanaCell, cd);
        kanaCell.addEventListener('click', activate);
        kanaCell.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
        updateKanaState(key, kanaCell, cd);
      }
      const kanjiCell = createCell(isKanji ? item.kanji : '', `cell--kanji ${isKanji ? 'cell--interactive' : 'cell--empty'}`);
      kanjiCell.setAttribute('role', 'cell');
      if (isKanji) {
        kanjiCell.tabIndex = 0;
        kanjiCell.setAttribute('role', 'button');
        kanjiCell.setAttribute('aria-label', `Dengarkan ${item.kanji}`);
        kanjiCell.addEventListener('click', () => speak(item.kana));
        kanjiCell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); speak(item.kana); } });
      }
      const meaningCell = createCell(item.arti || '', 'cell--meaning');
      meaningCell.setAttribute('role', 'cell');
      row.append(kanaCell, kanjiCell, meaningCell);
      fragment.appendChild(row);
    });
    els.rows.appendChild(fragment);
  }
  function updateKanaState(key, cell, bar) {
    const now = Date.now(); const timing = kanaCooldowns.get(key);
    cell.classList.remove('cell--blurred', 'cell--revealed', 'cell--cooldown');
    if (timing && now < timing.revealUntil) {
      cell.classList.add('cell--revealed');
      cell.setAttribute('aria-label', 'Kana terbuka');
      bar.style.transform = 'scaleX(0)';
    } else if (timing && now < timing.cooldownUntil) {
      cell.classList.add('cell--cooldown');
      cell.setAttribute('aria-label', 'Kana sedang cooldown');
      const percent = (now - timing.revealUntil) / COOLDOWN_MS;
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, percent))})`;
    } else {
      kanaCooldowns.delete(key);
      cell.classList.add('cell--blurred');
      cell.setAttribute('aria-label', 'Tap untuk membuka kana');
      bar.style.transform = 'scaleX(0)';
    }
  }
  function revealKana(key, cell, bar) {
    const now = Date.now(), old = kanaCooldowns.get(key);
    if (old && now < old.cooldownUntil) return;
    kanaCooldowns.set(key, { revealUntil: now + REVEAL_MS, cooldownUntil: now + REVEAL_MS + COOLDOWN_MS });
    updateKanaState(key, cell, bar);
    // Restrict interval work to the clicked cell. No global animation loop.
    const timer = window.setInterval(() => {
      if (!cell.isConnected) { clearInterval(timer); runningTimers.delete(timer); return; }
      updateKanaState(key, cell, bar);
      if (!kanaCooldowns.has(key)) { clearInterval(timer); runningTimers.delete(timer); }
    }, 100);
    runningTimers.add(timer);
  }
  function clearDomTimers() { for (const timer of runningTimers) clearInterval(timer); runningTimers.clear(); }
  function switchTab(target) {
    closeFeedback(false);
    state.tab = target;
    const list = target === 'list';
    els.listPanel.hidden = !list; els.quizPanel.hidden = list;
    els.listTab.classList.toggle('is-active', list);
    els.quizTab.classList.toggle('is-active', !list);
    els.listTab.setAttribute('aria-selected', String(list));
    els.quizTab.setAttribute('aria-selected', String(!list));
    els.search.closest('.field').hidden = !list;
    if (!list) resetQuiz();
  }
  function resetQuiz() {
    state.quizItems = entries(state.chapter).filter(item => hasKanji(item.kanji) && normalize(item.kana));
    state.quizIndex = 0; state.mistakes = 0;
    els.quizAnswer.value = '';
    els.inputHint.textContent = 'Jawab dengan kana sesuai bacaan di data. Romaji tidak diterima.';
    renderQuiz();
  }
  function renderQuiz() {
    const total = state.quizItems.length, idx = state.quizIndex;
    els.quizTitle.textContent = `Tes bacaan · Bab ${state.chapter}`;
    els.quizCount.textContent = `${Math.min(idx,total)} / ${total}`;
    els.progress.style.width = `${total ? 100 * Math.min(idx,total) / total : 0}%`;
    els.quizEmpty.hidden = total !== 0;
    els.quizFinish.hidden = total === 0 || idx < total;
    els.quizWork.hidden = total === 0 || idx >= total;
    if (idx < total) els.quizKanji.textContent = state.quizItems[idx].kanji;
  }
  const svgIcon = success => success ?
    '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="20" stroke="#16A34A" stroke-width="3.5"/><path d="m14 24 7 7 13-15" stroke="#16A34A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>' :
    '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="20" stroke="#DC2626" stroke-width="3.5"/><path d="M17 17 31 31M31 17 17 31" stroke="#DC2626" stroke-width="4" stroke-linecap="round"/></svg>';
  function feedback(isCorrect, thirdWrong) {
    closeFeedback(false);
    state.lastFocus = document.activeElement;
    state.popupAction = () => {
      if (isCorrect) { state.quizIndex++; state.mistakes = 0; els.quizAnswer.value = ''; renderQuiz(); }
      else if (thirdWrong) switchTab('list');
      else { els.quizAnswer.value = ''; }
      if (state.tab === 'quiz' && !els.quizWork.hidden) els.quizAnswer.focus({ preventScroll: true });
    };
    els.dialog.classList.toggle('feedback--correct', isCorrect);
    els.dialog.classList.toggle('feedback--wrong', !isCorrect);
    els.feedbackSymbol.innerHTML = svgIcon(isCorrect);
    els.feedbackTitle.textContent = isCorrect ? '正解です！' : '違います';
    els.feedbackDesc.textContent = isCorrect ? 'Jawaban benar!' : thirdWrong ? 'Tiga kali salah. Kembali ke daftar kotoba untuk review.' : 'Silakan coba lagi!';
    els.feedbackAttempts.textContent = isCorrect ? '' : `Kesalahan ${state.mistakes}/3`;
    els.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    els.dialog.focus({preventScroll:true});
    state.popupTimer = setTimeout(() => closeFeedback(true), FEEDBACK_MS);
  }
  function closeFeedback(performAction) {
    if (state.popupTimer) clearTimeout(state.popupTimer);
    state.popupTimer = 0;
    const action = state.popupAction; state.popupAction = null;
    els.overlay.hidden = true;
    document.body.style.overflow = '';
    if (performAction && typeof action === 'function') action();
  }
  function isKanaOnly(value) { return kanaRegex.test(value); }
  function handleAnswer(event) {
    event.preventDefault();
    if (state.composing || !els.overlay.hidden || !state.quizItems[state.quizIndex]) return;
    const answer = normalize(els.quizAnswer.value);
    if (!answer) { els.inputHint.textContent = 'Isi jawaban dengan kana terlebih dahulu.'; return; }
    if (!isKanaOnly(answer)) {
      els.inputHint.textContent = 'Gunakan keyboard Jepang. Romaji tidak diterima.';
      return; // Invalid input does not count as a mistake.
    }
    const expected = normalize(state.quizItems[state.quizIndex].kana);
    if (answer === expected) feedback(true, false);
    else { state.mistakes += 1; feedback(false, state.mistakes >= 3); }
  }
  function changeChapter() {
    const parsed = Number(els.chapter.value);
    if (parsed < 1 || parsed > 50) return;
    closeFeedback(false); clearDomTimers();
    state.chapter = parsed;
    els.search.value = ''; state.query = '';
    renderList(); resetQuiz();
  }
  function attach() {
    refreshChapterOptions();
    els.chapter.value = '1';
    els.chapter.addEventListener('change', changeChapter);
    els.search.addEventListener('input', () => { state.query = els.search.value.trim(); clearDomTimers(); renderList(); });
    els.listTab.addEventListener('click', () => switchTab('list'));
    els.quizTab.addEventListener('click', () => switchTab('quiz'));
    els.quizForm.addEventListener('submit', handleAnswer);
    els.quizAnswer.addEventListener('compositionstart', () => { state.composing = true; });
    els.quizAnswer.addEventListener('compositionend', () => { state.composing = false; validateInputDisplay(); });
    els.quizAnswer.addEventListener('input', () => { if (!state.composing) validateInputDisplay(); });
    els.restart.addEventListener('click', resetQuiz);
    els.overlay.addEventListener('click', event => { if (event.target === els.overlay) closeFeedback(true); });
    // Escape also closes the popup for desktop keyboard accessibility.
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !els.overlay.hidden) { event.preventDefault(); closeFeedback(true); } });
    renderList(); resetQuiz();
  }
  function validateInputDisplay() {
    const value = els.quizAnswer.value;
    if (!value.trim() || isKanaOnly(normalize(value))) {
      els.inputHint.textContent = 'Jawab dengan kana sesuai bacaan di data. Romaji tidak diterima.';
      return;
    }
    // Do not strip romaji DURING IME composition; it would break Japanese keyboards.
    // Strip Latin input on finalized edits, including paste, leaving Japanese kana untouched.
    const pos = els.quizAnswer.selectionStart;
    els.quizAnswer.value = value.replace(/[A-Za-z0-9]/g, '');
    try { els.quizAnswer.setSelectionRange(Math.min(pos, els.quizAnswer.value.length), Math.min(pos, els.quizAnswer.value.length)); } catch (_) {}
    els.inputHint.textContent = 'Hanya huruf kana. Ganti keyboard ke bahasa Jepang.';
  }
  // Lightweight anti-selection/copy UX; not a DRM or source-code protection mechanism.
  document.addEventListener('copy', event => event.preventDefault());
  document.addEventListener('cut', event => event.preventDefault());
  document.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('selectstart', event => {
    if (!(event.target instanceof Element) || !event.target.closest('input, textarea, [contenteditable]')) event.preventDefault();
  });
  document.addEventListener('contextmenu', event => {
    if (!(event.target instanceof Element) || !event.target.closest('input, textarea, [contenteditable]')) event.preventDefault();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
