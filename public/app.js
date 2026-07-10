const state = {
  version: "krv",
  bookId: "Mark",
  chapter: 14,
  mode: "read",
  blankMode: "nouns",
  verses: [],
  savedChapters: [],
  title: "",
  source: "",
  shuffled: false,
  focusIndex: 0,
  answersChecked: false
};

const els = {
  versionSelect: document.querySelector("#versionSelect"),
  bookSelect: document.querySelector("#bookSelect"),
  chapterSelect: document.querySelector("#chapterSelect"),
  loadChapterBtn: document.querySelector("#loadChapterBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  refreshSavedBtn: document.querySelector("#refreshSavedBtn"),
  savedChapterList: document.querySelector("#savedChapterList"),
  difficultyRange: document.querySelector("#difficultyRange"),
  difficultyValue: document.querySelector("#difficultyValue"),
  blankModeSelect: document.querySelector("#blankModeSelect"),
  hideRefsCheck: document.querySelector("#hideRefsCheck"),
  firstLetterCheck: document.querySelector("#firstLetterCheck"),
  autoRevealCheck: document.querySelector("#autoRevealCheck"),
  pasteInput: document.querySelector("#pasteInput"),
  importBtn: document.querySelector("#importBtn"),
  sourceLabel: document.querySelector("#sourceLabel"),
  chapterTitle: document.querySelector("#chapterTitle"),
  progressCount: document.querySelector("#progressCount"),
  progressBar: document.querySelector("#progressBar"),
  resetProgressBtn: document.querySelector("#resetProgressBtn"),
  checkAnswersBtn: document.querySelector("#checkAnswersBtn"),
  keywordQuizBtn: document.querySelector("#keywordQuizBtn"),
  clearWeakWordsBtn: document.querySelector("#clearWeakWordsBtn"),
  keywordList: document.querySelector("#keywordList"),
  weakWordList: document.querySelector("#weakWordList"),
  messageBox: document.querySelector("#messageBox"),
  verseList: document.querySelector("#verseList"),
  modeTabs: document.querySelectorAll(".mode-tabs button")
};

function init() {
  renderBooks();
  bindEvents();
  updateChapters();
  loadSavedChapters();
  render();
}

function renderBooks() {
  els.bookSelect.innerHTML = BibleProvider.books
    .map((book) => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.name)}</option>`)
    .join("");
  els.bookSelect.value = state.bookId;
}

function bindEvents() {
  els.versionSelect.addEventListener("change", () => {
    state.version = els.versionSelect.value;
  });

  els.bookSelect.addEventListener("change", () => {
    state.bookId = els.bookSelect.value;
    state.chapter = 1;
    updateChapters();
  });

  els.chapterSelect.addEventListener("change", () => {
    state.chapter = Number(els.chapterSelect.value);
  });

  els.loadChapterBtn.addEventListener("click", loadSelectedChapter);
  els.refreshSavedBtn.addEventListener("click", loadSavedChapters);
  els.shuffleBtn.addEventListener("click", () => {
    state.shuffled = !state.shuffled;
    render();
  });

  els.difficultyRange.addEventListener("input", () => {
    els.difficultyValue.textContent = `${els.difficultyRange.value}%`;
    render();
  });

  els.blankModeSelect.addEventListener("change", () => {
    state.blankMode = els.blankModeSelect.value;
    state.answersChecked = false;
    render();
  });

  els.hideRefsCheck.addEventListener("change", render);
  els.firstLetterCheck.addEventListener("change", render);
  els.autoRevealCheck.addEventListener("change", render);

  els.importBtn.addEventListener("click", importPastedText);
  els.resetProgressBtn.addEventListener("click", resetProgress);
  els.checkAnswersBtn.addEventListener("click", checkAnswers);
  els.keywordQuizBtn.addEventListener("click", startKeywordQuiz);
  els.clearWeakWordsBtn.addEventListener("click", clearWeakWords);

  els.modeTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.answersChecked = false;
      els.modeTabs.forEach((tab) => tab.classList.toggle("active", tab === button));
      render();
    });
  });
}

function updateChapters() {
  const book = getBook();
  els.chapterSelect.innerHTML = Array.from({ length: book.chapters }, (_, index) => {
    const chapter = index + 1;
    return `<option value="${chapter}">${chapter}장</option>`;
  }).join("");
  els.chapterSelect.value = state.chapter;
}

async function loadSavedChapters() {
  try {
    const response = await fetch("/api/chapters");
    const payload = await response.json();
    state.savedChapters = payload.chapters || [];
    renderSavedChapters();
  } catch {
    els.savedChapterList.innerHTML = `<p class="empty-note">저장 목록을 불러오지 못했습니다.</p>`;
  }
}

function renderSavedChapters() {
  if (!state.savedChapters.length) {
    els.savedChapterList.innerHTML = `<p class="empty-note">아직 저장된 장이 없습니다.</p>`;
    return;
  }

  els.savedChapterList.innerHTML = state.savedChapters
    .map((chapter) => {
      const active = chapter.code === state.bookId && Number(chapter.chapter) === state.chapter;
      return `
        <button class="saved-item${active ? " active" : ""}" data-code="${escapeHtml(chapter.code)}" data-chapter="${chapter.chapter}" type="button">
          <span>${escapeHtml(chapter.title)}</span>
          <small>${chapter.verseCount}절</small>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".saved-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.bookId = button.dataset.code;
      state.chapter = Number(button.dataset.chapter);
      els.bookSelect.value = state.bookId;
      updateChapters();
      loadSelectedChapter();
    });
  });
}

async function loadSelectedChapter() {
  setMessage("본문을 불러오는 중입니다.", "저장된 장이 있으면 바로 열고, 없으면 시조사 재림성경에서 자동 수집합니다.");
  try {
    const result = await BibleProvider.fetchChapter(state);
    state.verses = result.verses;
    state.source = getSourceLabel(result.source);
    state.title = result.title || `${getBook().name} ${state.chapter}장`;
    state.shuffled = false;
    state.focusIndex = 0;
    state.answersChecked = false;
    await loadSavedChapters();
    render();
  } catch (error) {
    setMessage("본문을 불러오지 못했습니다.", error.message);
    state.verses = [];
    render();
  }
}

async function importPastedText() {
  const verses = BibleProvider.parsePastedVerses(els.pasteInput.value);
  if (!verses.length) {
    setMessage("붙여넣은 본문을 인식하지 못했습니다.", "각 줄을 `절번호 본문` 형식으로 입력하면 가장 정확합니다.");
    return;
  }

  state.verses = verses;
  state.source = "직접 입력 본문";
  state.title = `${getBook().name} ${state.chapter}장`;
  BibleProvider.saveLocalChapter({ ...state, verses });

  await saveChapterToServer({
    source: "manual",
    title: state.title,
    code: state.bookId,
    chapter: state.chapter,
    verses
  });
  await loadSavedChapters();
  render();
}

async function saveChapterToServer(chapter) {
  const response = await fetch("/api/chapters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(chapter)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "본문을 서버에 저장하지 못했습니다.");
  }
}

function render() {
  els.chapterTitle.textContent = state.title || "저장된 장을 고르거나 새 장을 불러오세요";
  els.sourceLabel.textContent = state.source || "본문 대기 중";
  els.difficultyValue.textContent = `${els.difficultyRange.value}%`;
  renderProgress();
  renderWordLab();

  if (!state.verses.length) {
    els.verseList.innerHTML = "";
    els.messageBox.classList.remove("hidden");
    return;
  }

  els.messageBox.classList.add("hidden");
  const verses = getVisibleVerses();
  els.verseList.innerHTML = verses.map(renderVerseCard).join("");
  bindVerseActions();
}

function getVisibleVerses() {
  return state.shuffled ? shuffle([...state.verses]) : state.verses;
}

function renderVerseCard(item) {
  const refText = els.hideRefsCheck.checked ? "" : `${state.title} ${item.verse}절`;
  const body = renderVerseBody(item);
  const actions = state.mode === "read"
    ? `<div class="verse-actions"><button data-action="speak" type="button">듣기</button></div>`
    : "";

  return `
    <article class="verse-card" data-verse="${item.verse}">
      <div class="verse-head">
        <span class="ref">${refText}</span>
        ${actions}
      </div>
      ${body}
    </article>
  `;
}

function renderVerseBody(item) {
  if (state.mode === "quiz") {
    const original = els.autoRevealCheck.checked && state.answersChecked
      ? `<p class="answer-line">${escapeHtml(item.text)}</p>`
      : "";
    return `<div class="quiz-line">${makeQuizTokens(item.text, item.verse).join("")}</div>${original}`;
  }

  return `<p class="verse-text">${escapeHtml(item.text)}</p>`;
}

function bindVerseActions() {
  document.querySelectorAll(".verse-card").forEach((card) => {
    const verseNumber = Number(card.dataset.verse);
    const verse = state.verses.find((item) => item.verse === verseNumber);
    const speakButton = card.querySelector('[data-action="speak"]');
    if (speakButton) speakButton.addEventListener("click", () => speak(verse.text));
  });

  document.querySelectorAll(".blank-input").forEach((input) => {
    input.addEventListener("input", () => markInput(input));
  });
}

function makeQuizTokens(text, verseNumber) {
  const difficulty = Number(els.difficultyRange.value) / 100;
  const parts = text.match(/[가-힣A-Za-z0-9]+|[^\s가-힣A-Za-z0-9]+|\s+/g) || [];
  const eligible = parts
    .map((part, index) => ({ part, index }))
    .map((item) => ({ ...item, noun: analyzeNounToken(item.part) }))
    .filter(({ noun }) => noun);
  const blankCount = Math.max(1, Math.round(eligible.length * difficulty));
  const blankIndexes = chooseBlankIndexes(eligible, blankCount, verseNumber);

  return parts.map((part, index) => {
    if (!blankIndexes.has(index)) return `<span>${escapeHtml(part)}</span>`;
    const noun = eligible.find((item) => item.index === index).noun;
    const placeholder = makeNounHint(noun.answer);
    const width = Math.min(190, Math.max(82, [...placeholder].length * 24));
    return `<span class="blank-wrap"><input class="blank-input" style="width:${width}px" data-answer="${escapeHtml(noun.answer)}" placeholder="${escapeHtml(placeholder)}" aria-label="명사 빈칸 정답 입력" />${noun.suffix ? `<span class="blank-suffix">${escapeHtml(noun.suffix)}</span>` : ""}</span>`;
  });
}

function chooseBlankIndexes(eligible, blankCount, verseNumber) {
  return new Set(
    eligible
      .sort((a, b) => scoreWord(b.noun.answer) + getWordFrequency(b.noun.answer) * 6 - (scoreWord(a.noun.answer) + getWordFrequency(a.noun.answer) * 6))
      .slice(0, blankCount)
      .map(({ index }) => index)
  );
}

function analyzeNounToken(token) {
  if (!/^[가-힣]+$/.test(token)) return null;

  const suffixes = [
    "들에게서는", "들에게도", "들에게는", "들에서는", "들에서도", "들에는", "들에도", "들로서는", "들로도",
    "들께서는", "들께서", "들에게서", "들로부터", "들에게", "들한테", "들까지", "들부터", "들과", "들은", "들이", "들을", "들도", "들만",
    "에게서는", "에게도", "에게는", "에서는", "에서도", "에는", "에도", "으로는", "으로도", "로서는", "로도",
    "께서는", "께서", "에게서", "으로부터", "로부터", "에게", "한테", "에서", "으로", "라고", "대로", "들과", "과", "와", "은", "는", "이", "가", "을", "를", "도", "만", "에", "의", "께", "로"
  ].sort((a, b) => b.length - a.length);

  for (const suffix of suffixes) {
    if (!token.endsWith(suffix) || token.length <= suffix.length) continue;
    const answer = token.slice(0, -suffix.length);
    return isLikelyNoun(answer) ? { answer, suffix } : null;
  }

  if (isKnownNoun(token)) return { answer: token, suffix: "" };
  return null;
}

function isLikelyNoun(word) {
  if (!word || [...word].length < 2) return false;
  if (["너희", "우리", "그들", "자기", "어디", "무엇", "아무"].includes(word)) return false;
  if (/(하기|되기|가기|오기|먹기|보기|주기|받기|말하기|준비하기)$/.test(word)) return false;
  if (/[하되시었였겠더라니며고서]$/.test(word)) return false;
  return true;
}

function isKnownNoun(word) {
  return [
    "예수", "그리스도", "하나님", "성령", "아버지", "주", "복음", "말씀", "제자", "베드로", "요한", "야고보", "유다",
    "갈릴리", "예루살렘", "성전", "대제사장", "서기관", "바리새인", "사람", "무리", "천국", "하늘", "땅", "믿음", "사랑", "죄", "생명", "진리"
  ].includes(word);
}

function makeNounHint(answer) {
  const chars = [...answer];
  return els.firstLetterCheck.checked
    ? `${chars[0]}${"*".repeat(Math.max(0, chars.length - 1))}`
    : "*".repeat(chars.length);
}

function scoreWord(word) {
  const commonEndings = /(은|는|이|가|을|를|에|의|와|과|도|로|으로|라|니|며|고|되|하니|하라)$/;
  return word.length * 3 - (commonEndings.test(word) ? 4 : 0) + (/^[0-9]+$/.test(word) ? 1 : 0);
}

function checkAnswers() {
  state.answersChecked = true;
  recordWeakWords();
  document.querySelectorAll(".blank-input, .full-verse-input").forEach(markInput);
  if (els.autoRevealCheck.checked) render();
  else renderWordLab();
}

function markInput(input) {
  const expected = normalizeAnswer(input.dataset.answer);
  const actual = normalizeAnswer(input.value);
  const correct = actual && actual === expected;
  const wrong = actual.length >= Math.min(expected.length, 2) && actual !== expected;
  input.classList.toggle("correct", correct);
  input.classList.toggle("wrong", wrong);
}

function startKeywordQuiz() {
  state.mode = "quiz";
  state.blankMode = "nouns";
  state.answersChecked = false;
  els.blankModeSelect.value = "nouns";
  els.difficultyRange.value = Math.max(Number(els.difficultyRange.value), 45);
  els.modeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === "quiz"));
  render();
}

function renderWordLab() {
  renderKeywordList();
  renderWeakWordList();
}

function renderKeywordList() {
  if (!state.verses.length) {
    els.keywordList.innerHTML = `<span class="word-chip empty">장을 선택하면 핵심 단어가 표시됩니다.</span>`;
    return;
  }

  const words = getTopWords(12);
  els.keywordList.innerHTML = words.length
    ? words.map(({ word, count }) => `<span class="word-chip">${escapeHtml(word)} <strong>${count}</strong></span>`).join("")
    : `<span class="word-chip empty">표시할 단어가 없습니다.</span>`;
}

function renderWeakWordList() {
  const weakWords = Object.entries(loadWeakWords())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 14);

  els.weakWordList.innerHTML = weakWords.length
    ? weakWords.map(([word, count]) => `<span class="word-chip">${escapeHtml(word)} <strong>${count}</strong></span>`).join("")
    : `<span class="word-chip empty">정답 확인 후 틀린 단어가 쌓입니다.</span>`;
}

function recordWeakWords() {
  const weakWords = loadWeakWords();
  document.querySelectorAll(".blank-input, .full-verse-input").forEach((input) => {
    const expected = normalizeAnswer(input.dataset.answer);
    const actual = normalizeAnswer(input.value);
    if (!expected || !actual || actual === expected) return;
    const label = input.dataset.answer;
    weakWords[label] = (weakWords[label] || 0) + 1;
  });
  localStorage.setItem("bible.weakWords", JSON.stringify(weakWords));
}

function loadWeakWords() {
  try {
    return JSON.parse(localStorage.getItem("bible.weakWords") || "{}");
  } catch {
    return {};
  }
}

function clearWeakWords() {
  localStorage.removeItem("bible.weakWords");
  renderWordLab();
}

function getTopWords(limit) {
  return Object.entries(getChapterWordFrequency())
    .map(([word, count]) => ({ word, count, score: scoreWord(word) + count * 5 }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.word.localeCompare(b.word, "ko"))
    .slice(0, limit);
}

function getChapterWordFrequency() {
  const frequency = {};
  state.verses.forEach((verse) => {
    extractWords(verse.text).forEach((word) => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
  });
  return frequency;
}

function getWordFrequency(word) {
  return getChapterWordFrequency()[word] || 0;
}

function extractWords(text) {
  return (text.match(/[\p{L}\p{N}]+/gu) || [])
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !/^[0-9]+$/.test(word));
}

function renderProgress() {
  const total = state.verses.length;
  const percent = total ? 100 : 0;
  els.progressCount.textContent = `${total}절`;
  els.progressBar.style.width = `${percent}%`;
}

function resetProgress() {
  document.querySelectorAll(".blank-input, .full-verse-input").forEach((input) => {
    input.value = "";
    input.classList.remove("correct", "wrong");
  });
  state.answersChecked = false;
  renderWordLab();
}

function getBook() {
  return BibleProvider.books.find((book) => book.id === state.bookId) || BibleProvider.books[0];
}

function getSourceLabel(source) {
  if (source === "local") return "로컬 저장 본문";
  if (source === "fixed") return "저장된 배포 본문";
  return "시조사 재림성경 자동 수집";
}

function setMessage(title, detail) {
  els.messageBox.classList.remove("hidden");
  els.messageBox.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>`;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

function normalizeAnswer(value) {
  return value.replace(/[^\p{L}\p{N}]/gu, "").trim();
}

function seededShuffle(items, seed) {
  const copy = [...items];
  let value = seed * 9301 + 49297;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    value = (value * 9301 + 49297) % 233280;
    const next = value % (index + 1);
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [items[index], items[next]] = [items[next], items[index]];
  }
  return items;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
