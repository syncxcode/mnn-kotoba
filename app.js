/* JFT 「言葉」 — kategori kotoba, suara, popup, dan tes bacaan. */
(() => {
  'use strict';

  const DATA = Array.isArray(window.JFT_KOTOBA) ? window.JFT_KOTOBA : [];
  const CATEGORIES = [
    '動詞', '形容詞', '形容動詞', '名詞',
    '副詞', '接続詞', '助詞', '感動詞', '表現'
  ];
  const FEEDBACK_MS = 8000;
  const PAGE_SIZE = 10;
  const A_Z = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const JA = new Intl.Collator('ja');
  const kanaRegex = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\s]+$/u;
  const hasKanji = value => /\p{Script=Han}/u.test(value || '');
  const normalize = value => String(value || '').normalize('NFC').trim();
  const $ = id => document.getElementById(id);

  const els = {
    category: $('categorySelect'), search: $('searchInput'),
    listTab: $('listTab'), quizTab: $('quizTab'),
    listPanel: $('listPanel'), quizPanel: $('quizPanel'),
    rows: $('vocabRows'),
    listTitle: $('listTitle'), listEmpty: $('listEmpty'),
    pagination: $('paginationNav'), pagePrevious: $('pagePrevious'),
    pageNext: $('pageNext'), pageIndicator: $('pageIndicator'),
    quizTitle: $('quizTitle'), quizCount: $('quizCount'), progress: $('progressFill'),
    quizWork: $('quizWork'), quizEmpty: $('quizEmpty'), quizFinish: $('quizFinish'),
    quizKanji: $('quizKanji'), quizForm: $('quizForm'),
    quizAnswer: $('quizAnswer'), inputHint: $('inputHint'), restart: $('restartQuiz'),
    overlay: $('feedbackOverlay'), dialog: $('feedbackDialog'),
    feedbackSymbol: $('feedbackSymbol'), feedbackTitle: $('feedbackTitle'),
    feedbackDesc: $('feedbackDescription'), feedbackAttempts: $('feedbackAttempts'),
    meaningOverlay: $('meaningOverlay'), meaningDialog: $('meaningDialog'),
    meaningTitle: $('meaningTitle'), meaningFull: $('meaningFull'),
    closeMeaning: $('closeMeaning'), audioStatus: $('audioStatus')
  };

  const state = {
    category: CATEGORIES.find(category => DATA.some(item => item.kategori === category)) || CATEGORIES[0], tab: 'list', query: '', page: 0,
    quizItems: [], quizIndex: 0, mistakes: 0,
    composing: false, popupTimer: 0, popupAction: null
  };

  // Alphabetize each Japanese category A–Z by the stored reading, without showing romaji.
  // A later import can optionally provide sortKey for exceptional readings.
  const kanaToLatin = value => {
    const map = {
      あ:'a',い:'i',う:'u',え:'e',お:'o',
      か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',
      さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',
      た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',
      な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',
      は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',
      ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',
      や:'ya',ゆ:'yu',よ:'yo',
      ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',
      わ:'wa',ゐ:'wi',ゑ:'we',を:'wo',ん:'n',
      が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',
      ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',
      だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',
      ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
      ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',
      ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o',ゎ:'wa',
      ゔ:'vu'
    };
    const combo = {
      きゃ:'kya',きゅ:'kyu',きょ:'kyo',しゃ:'sha',しゅ:'shu',しょ:'sho',
      ちゃ:'cha',ちゅ:'chu',ちょ:'cho',にゃ:'nya',にゅ:'nyu',にょ:'nyo',
      ひゃ:'hya',ひゅ:'hyu',ひょ:'hyo',みゃ:'mya',みゅ:'myu',みょ:'myo',
      りゃ:'rya',りゅ:'ryu',りょ:'ryo',ぎゃ:'gya',ぎゅ:'gyu',ぎょ:'gyo',
      じゃ:'ja',じゅ:'ju',じょ:'jo',ぢゃ:'ja',ぢゅ:'ju',ぢょ:'jo',
      びゃ:'bya',びゅ:'byu',びょ:'byo',ぴゃ:'pya',ぴゅ:'pyu',ぴょ:'pyo',
      しぇ:'she',ちぇ:'che',じぇ:'je',てぃ:'ti',でぃ:'di',
      とぅ:'tu',どぅ:'du',ふぁ:'fa',ふぃ:'fi',ふぇ:'fe',ふぉ:'fo',
      ふゅ:'fyu',うぃ:'wi',うぇ:'we',うぉ:'wo',ゔぁ:'va',
      ゔぃ:'vi',ゔぇ:'ve',ゔぉ:'vo',つぁ:'tsa',つぃ:'tsi',
      つぇ:'tse',つぉ:'tso'
    };
    const hiragana = normalize(value).normalize('NFKC').replace(/[ァ-ヶ]/g,
      char => String.fromCharCode(char.charCodeAt(0) - 96));
    let latin = '';
    for (let i = 0; i < hiragana.length; i++) {
      const char = hiragana[i];
      if (char === 'っ') {
        const syllable = combo[hiragana.slice(i + 1, i + 3)] || map[hiragana[i + 1]] || '';
        latin += syllable.startsWith('ch') ? 't' : syllable.charAt(0);
        continue;
      }
      if (char === 'ー') {
        const vowel = latin.match(/[aeiou]$/)?.[0] || '';
        latin += vowel;
        continue;
      }
      const pair = combo[hiragana.slice(i, i + 2)];
      if (pair) { latin += pair; i++; continue; }
      latin += map[char] || char.toLowerCase();
    }
    return latin;
  };
  const alphabetKey = item => normalize(item.sortKey) || kanaToLatin(item.kana || item.kata);
  const compareKotoba = (a, b) =>
    A_Z.compare(alphabetKey(a), alphabetKey(b)) ||
    JA.compare(normalize(a.kana || a.kata), normalize(b.kana || b.kata)) ||
    JA.compare(normalize(a.kata), normalize(b.kata));
  const entries = () => DATA
    .filter(item => item.kategori === state.category)
    .sort(compareKotoba);

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function fillCategories() {
    els.category.replaceChildren();
    // Tampilkan hanya kategori yang benar-benar berisi kotoba.
    const available = new Set(DATA.map(item => item.kategori).filter(Boolean));
    [...CATEGORIES.filter(label => available.has(label)), ...[...available].filter(label => !CATEGORIES.includes(label))].forEach(label => {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      els.category.appendChild(option);
    });
    els.category.value = state.category;
  }

  function announceAudio(message) {
    if (!els.audioStatus) return;
    els.audioStatus.textContent = message;
  }

  function speak(item, button) {
    button.classList.remove('word-speak--active');
    // Restart the tiny tap animation on every press, without changing layout.
    void button.offsetWidth;
    button.classList.add('word-speak--active');
    button.addEventListener('animationend', () =>
      button.classList.remove('word-speak--active'), { once: true });

    if (!('speechSynthesis' in window)) {
      announceAudio('Suara Jepang tidak tersedia pada browser ini.');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(item.kana || item.kata);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.88;
      utterance.onerror = () => announceAudio('Pengucapan gagal. Periksa suara Jepang di perangkat.');
      utterance.onstart = () => announceAudio('');
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      announceAudio('Pengucapan tidak tersedia di perangkat ini.');
    }
  }

  const expandSvg = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10V3m-4 4 4-4 4 4M12 14v7m-4-4 4 4 4-4"/></svg>';

  function renderList() {
    const all = entries();
    const q = state.query.toLocaleLowerCase();
    const shown = all.filter(item =>
      [item.kata, item.kana, item.arti].some(value =>
        String(value || '').toLocaleLowerCase().includes(q))
    );

    const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page, pageCount - 1));
    const pageItems = shown.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);

    els.listTitle.textContent = state.category;
    els.rows.replaceChildren();
    els.listEmpty.hidden = shown.length > 0;
    if (!shown.length) els.listEmpty.textContent =
      all.length ? 'Tidak ada kata yang cocok.' : 'Belum ada kotoba dalam kategori ini.';

    // No pagination needed for empty lists or categories with ten words or fewer.
    els.pagination.hidden = pageCount <= 1;
    els.pageIndicator.textContent = (state.page + 1) + ' / ' + pageCount;
    els.pagePrevious.disabled = state.page === 0;
    els.pageNext.disabled = state.page >= pageCount - 1;

    const fragment = document.createDocumentFragment();
    pageItems.forEach(item => {
      const row = element('div', 'vocab-row');
      row.setAttribute('role', 'row');

      const wordCell = element('div', 'cell cell--word jp');
      wordCell.setAttribute('role', 'cell');
      wordCell.lang = 'ja';

      const wordButton = element('button', 'word-speak', item.kata || item.kana);
      wordButton.type = 'button';
      wordButton.lang = 'ja';
      wordButton.setAttribute('aria-label', 'Dengarkan ' + (item.kata || item.kana));
      wordButton.addEventListener('click', () => speak(item, wordButton));

      const expandButton = element('button', 'word-expand');
      expandButton.type = 'button';
      expandButton.innerHTML = expandSvg;
      expandButton.setAttribute('aria-label', 'Bentangkan ' + (item.kata || item.kana));
      expandButton.title = 'Lihat kata dan arti lengkap';
      expandButton.addEventListener('click', () => openMeaning(item));

      wordCell.append(wordButton, expandButton);
      const meaningCell = element('div', 'cell cell--meaning');
      meaningCell.setAttribute('role', 'cell');
      meaningCell.appendChild(element('span', 'meaning-text', item.arti || ''));
      row.append(wordCell, meaningCell);
      fragment.appendChild(row);
    });
    els.rows.appendChild(fragment);
  }

  function changePage(delta) {
    const previousPage = state.page;
    state.page += delta;
    renderList(); // renderList clamps page index to valid bounds.
    if (state.page === previousPage) return;
    // Return to the START OF THE WORD LIST, below the sticky masthead.
    // Do this after rendering so the shorter list cannot leave the user at the old scroll position.
    window.requestAnimationFrame(() => {
      const stickyHeight = document.querySelector('.masthead')?.getBoundingClientRect().height || 0;
      const offset = els.listPanel.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, offset - stickyHeight - 12), behavior: 'auto' });
    });
  }

  let previousFocus = null;
  let scrollState = null;
  function lockScroll() {
    if (scrollState) return;
    const body = document.body;
    const width = window.innerWidth - document.documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    scrollState = {
      x: window.scrollX, y: window.scrollY,
      styles: ['top', 'left', 'padding-right'].map(prop =>
        [prop, body.style.getPropertyValue(prop), body.style.getPropertyPriority(prop)])
    };
    body.style.top = -scrollState.y + 'px';
    body.style.left = -scrollState.x + 'px';
    body.style.paddingRight = padding + width + 'px';
    document.documentElement.classList.add('meaning-open');
  }
  function unlockScroll() {
    if (!scrollState) return;
    const { x, y, styles } = scrollState;
    document.documentElement.classList.remove('meaning-open');
    for (const [prop, value, priority] of styles) {
      if (value) document.body.style.setProperty(prop, value, priority);
      else document.body.style.removeProperty(prop);
    }
    scrollState = null;
    window.scrollTo(x, y);
  }
  // Adjust only the Japanese text size. The modal dimensions never depend on text length.
  function fitMeaningWord() {
    if (els.meaningOverlay.hidden) return;
    const title = els.meaningTitle;
    const area = title.parentElement;
    const maxWidth = area.clientWidth - 8;
    const maxHeight = area.clientHeight - 8;
    if (maxWidth <= 0 || maxHeight <= 0) return;

    title.style.whiteSpace = 'nowrap';
    title.style.width = 'max-content';
    let size = 112;
    while (size > 26) {
      title.style.fontSize = size + 'px';
      if (title.scrollWidth <= maxWidth && title.scrollHeight <= maxHeight) return;
      size -= 2;
    }
    title.style.fontSize = '26px';
    if (title.scrollWidth <= maxWidth && title.scrollHeight <= maxHeight) return;

    // Exception for exceptionally long phrases: allow wrapping within the fixed word area.
    title.style.whiteSpace = 'normal';
    title.style.width = '100%';
    size = 34;
    while (size > 24) {
      title.style.fontSize = size + 'px';
      if (title.scrollHeight <= maxHeight && title.scrollWidth <= maxWidth) return;
      size -= 2;
    }
    title.style.fontSize = '24px';
    // On very small screens, the word area itself can scroll; never resize the modal.
  }
  function scheduleMeaningFit() {
    window.requestAnimationFrame(fitMeaningWord);
  }
  function openMeaning(item) {
    if (!els.meaningOverlay.hidden) return;
    previousFocus = document.activeElement;
    els.meaningTitle.textContent = item.kata || item.kana;
    els.meaningFull.textContent = item.arti || '';
    lockScroll();
    els.meaningOverlay.hidden = false;
    els.meaningDialog.scrollTop = 0;
    fitMeaningWord();
    // External fonts can finish loading after the popup is first shown.
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!els.meaningOverlay.hidden) scheduleMeaningFit();
      });
    }
    els.closeMeaning.focus({ preventScroll: true });
  }
  function closeMeaning() {
    if (els.meaningOverlay.hidden) return;
    els.meaningOverlay.hidden = true;
    unlockScroll();
    if (previousFocus && previousFocus.isConnected)
      previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function switchTab(tab) {
    closeFeedback(false);
    closeMeaning();
    state.tab = tab;
    const onList = tab === 'list';
    els.listPanel.hidden = !onList;
    els.quizPanel.hidden = onList;
    els.listTab.classList.toggle('is-active', onList);
    els.quizTab.classList.toggle('is-active', !onList);
    els.listTab.setAttribute('aria-selected', String(onList));
    els.quizTab.setAttribute('aria-selected', String(!onList));
    els.search.closest('.field').hidden = !onList;
    if (!onList) resetQuiz();
  }

  function resetQuiz() {
    state.quizItems = entries().filter(item =>
      hasKanji(item.kata) && kanaRegex.test(normalize(item.kana))
    );
    state.quizIndex = 0;
    state.mistakes = 0;
    els.quizAnswer.value = '';
    els.inputHint.textContent = 'Jawab dengan kana. Romaji tidak diterima.';
    renderQuiz();
  }
  function renderQuiz() {
    const total = state.quizItems.length;
    const idx = state.quizIndex;
    els.quizTitle.textContent = 'Tes bacaan · ' + state.category;
    els.quizCount.textContent = Math.min(idx, total) + ' / ' + total;
    els.progress.style.width = (total ? Math.min(idx, total) / total * 100 : 0) + '%';
    els.quizEmpty.hidden = total !== 0;
    els.quizFinish.hidden = total === 0 || idx < total;
    els.quizWork.hidden = total === 0 || idx >= total;
    if (idx < total) els.quizKanji.textContent = state.quizItems[idx].kata;
  }

  const feedbackIcon = correct => correct
    ? '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="20" stroke="#16A34A" stroke-width="3.5"/><path d="m14 24 7 7 13-15" stroke="#16A34A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="20" stroke="#DC2626" stroke-width="3.5"/><path d="M17 17 31 31M31 17 17 31" stroke="#DC2626" stroke-width="4" stroke-linecap="round"/></svg>';

  function feedback(correct, thirdWrong) {
    closeFeedback(false);
    els.quizAnswer.blur();
    state.popupAction = () => {
      if (correct) {
        state.quizIndex++;
        state.mistakes = 0;
        els.quizAnswer.value = '';
        renderQuiz();
      } else if (thirdWrong) switchTab('list');
      else els.quizAnswer.value = '';
    };
    els.dialog.classList.toggle('feedback--correct', correct);
    els.dialog.classList.toggle('feedback--wrong', !correct);
    els.feedbackSymbol.innerHTML = feedbackIcon(correct);
    els.feedbackTitle.textContent = correct ? '正解です！' : '違います';
    els.feedbackDesc.textContent = correct ? 'Jawaban benar!' :
      thirdWrong ? 'Tiga kali salah. Kembali ke daftar kotoba untuk review.' : 'Silakan coba lagi!';
    els.feedbackAttempts.textContent = correct ? '' : 'Kesalahan ' + state.mistakes + '/3';
    els.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    els.dialog.focus({ preventScroll: true });
    state.popupTimer = window.setTimeout(() => closeFeedback(true), FEEDBACK_MS);
  }
  function closeFeedback(doAction) {
    if (state.popupTimer) clearTimeout(state.popupTimer);
    state.popupTimer = 0;
    const action = state.popupAction;
    state.popupAction = null;
    els.overlay.hidden = true;
    document.body.style.overflow = '';
    if (doAction && typeof action === 'function') action();
  }

  function validateAnswer() {
    const value = els.quizAnswer.value;
    if (!value.trim() || kanaRegex.test(normalize(value))) {
      els.inputHint.textContent = 'Jawab dengan kana. Romaji tidak diterima.';
      return;
    }
    const cursor = els.quizAnswer.selectionStart;
    els.quizAnswer.value = value.replace(/[A-Za-z0-9]/g, '');
    try { els.quizAnswer.setSelectionRange(
      Math.min(cursor, els.quizAnswer.value.length),
      Math.min(cursor, els.quizAnswer.value.length)
    ); } catch (_) {}
    els.inputHint.textContent = 'Gunakan keyboard bahasa Jepang.';
  }
  function handleAnswer(event) {
    event.preventDefault();
    if (state.composing || !els.overlay.hidden || !state.quizItems[state.quizIndex]) return;
    const answer = normalize(els.quizAnswer.value);
    if (!answer) {
      els.inputHint.textContent = 'Isi jawaban terlebih dahulu.';
      return;
    }
    if (!kanaRegex.test(answer)) {
      els.inputHint.textContent = 'Gunakan huruf kana, bukan romaji.';
      return;
    }
    const expected = normalize(state.quizItems[state.quizIndex].kana);
    if (answer === expected) feedback(true, false);
    else {
      state.mistakes++;
      feedback(false, state.mistakes >= 3);
    }
  }

  function attach() {
    fillCategories();
    els.category.addEventListener('change', () => {
      state.category = els.category.value;
      state.page = 0;
      state.query = '';
      els.search.value = '';
      closeMeaning();
      closeFeedback(false);
      renderList();
      resetQuiz();
    });
    els.search.addEventListener('input', () => {
      state.query = els.search.value.trim();
      state.page = 0;
      renderList();
    });
    els.pagePrevious.addEventListener('click', () => changePage(-1));
    els.pageNext.addEventListener('click', () => changePage(1));
    els.listTab.addEventListener('click', () => switchTab('list'));
    els.quizTab.addEventListener('click', () => switchTab('quiz'));
    els.quizForm.addEventListener('submit', handleAnswer);
    els.quizAnswer.addEventListener('compositionstart', () => { state.composing = true; });
    els.quizAnswer.addEventListener('compositionend', () => {
      state.composing = false;
      validateAnswer();
    });
    els.quizAnswer.addEventListener('input', () => {
      if (!state.composing) validateAnswer();
    });
    els.restart.addEventListener('click', resetQuiz);
    els.overlay.addEventListener('click', event => {
      if (event.target === els.overlay) closeFeedback(true);
    });
    els.meaningOverlay.addEventListener('click', event => {
      if (event.target === els.meaningOverlay) closeMeaning();
    });
    els.closeMeaning.addEventListener('click', closeMeaning);
    window.addEventListener('resize', () => {
      if (!els.meaningOverlay.hidden) scheduleMeaningFit();
    });
    document.addEventListener('keydown', event => {
      if (!els.meaningOverlay.hidden) {
        if (event.key === 'Escape') { event.preventDefault(); closeMeaning(); }
        // Only the close button is focusable inside the meaning dialog.
        if (event.key === 'Tab') { event.preventDefault(); els.closeMeaning.focus(); }
      } else if (event.key === 'Escape' && !els.overlay.hidden) {
        event.preventDefault();
        closeFeedback(true);
      }
    });
    renderList();
    resetQuiz();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
