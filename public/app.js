const state = {
  version: "krv",
  bookId: "Mark",
  chapter: 14,
  mode: "read",
  blankMode: "important",
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
  focusPrevBtn: document.querySelector("#focusPrevBtn"),
  focusNextBtn: document.querySelector("#focusNextBtn"),
  drillLabel: document.querySelector("#drillLabel"),
  drillText: document.querySelector("#drillText"),
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
  els.focusPrevBtn.addEventListener("click", () => moveFocus(-1));
  els.focusNextBtn.addEventListener("click", () => moveFocus(1));

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
    state.source = result.source === "local" ? "로컬 저장 본문" : "시조사 재림성경 자동 수집";
    state.title = `${getBook().name} ${state.chapter}장`;
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
  renderDrill();

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
  const progressKey = getProgressKey(item.verse);
  const memorized = localStorage.getItem(progressKey) === "done";
  const refText = els.hideRefsCheck.checked ? "" : `${state.title} ${item.verse}절`;
  const body = renderVerseBody(item);

  return `
    <article class="verse-card${memorized ? " memorized" : ""}" data-verse="${item.verse}">
      <div class="verse-head">
        <span class="ref">${refText}</span>
        <div class="verse-actions">
          <button data-action="speak" type="button">듣기</button>
          <button data-action="toggle" type="button">${state.mode === "memorize" ? "보기" : "가리기"}</button>
          <button data-action="done" type="button">${memorized ? "외움 취소" : "외움"}</button>
        </div>
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

  const hiddenClass = state.mode === "memorize" ? " hidden-text" : "";
  return `<p class="verse-text${hiddenClass}">${escapeHtml(item.text)}</p>`;
}

function bindVerseActions() {
  document.querySelectorAll(".verse-card").forEach((card) => {
    const verseNumber = Number(card.dataset.verse);
    const verse = state.verses.find((item) => item.verse === verseNumber);

    card.querySelector('[data-action="speak"]').addEventListener("click", () => speak(verse.text));
    card.querySelector('[data-action="toggle"]').addEventListener("click", () => {
      const text = card.querySelector(".verse-text");
      if (text) text.classList.toggle("hidden-text");
    });
    card.querySelector('[data-action="done"]').addEventListener("click", () => {
      const key = getProgressKey(verseNumber);
      const done = localStorage.getItem(key) === "done";
      if (done) localStorage.removeItem(key);
      else localStorage.setItem(key, "done");
      render();
    });
  });

  document.querySelectorAll(".blank-input").forEach((input) => {
    input.addEventListener("input", () => markInput(input));
  });
}

function makeQuizTokens(text, verseNumber) {
  if (state.blankMode === "fullVerse") {
    return [
      `<textarea class="full-verse-input" data-answer="${escapeHtml(text)}" data-verse="${verseNumber}" aria-label="절 전체 입력"></textarea>`
    ];
  }

  const difficulty = Number(els.difficultyRange.value) / 100;
  const parts = text.match(/[가-힣A-Za-z0-9]+|[^\s가-힣A-Za-z0-9]+|\s+/g) || [];
  const eligible = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => /^[가-힣A-Za-z0-9]+$/.test(part) && part.length >= 2);
  const blankCount = Math.max(1, Math.round(eligible.length * difficulty));
  const blankIndexes = chooseBlankIndexes(eligible, blankCount, verseNumber);

  return parts.map((part, index) => {
    if (!blankIndexes.has(index)) return `<span>${escapeHtml(part)}</span>`;
    const hint = makeHint(part);
    const width = Math.min(170, Math.max(78, part.length * 26));
    return `${hint}<input class="blank-input" style="width:${width}px" data-answer="${escapeHtml(part)}" aria-label="빈칸 정답 입력" />`;
  });
}

function chooseBlankIndexes(eligible, blankCount, verseNumber) {
  if (state.blankMode === "random") {
    return new Set(
      seededShuffle(eligible, verseNumber)
        .slice(0, blankCount)
        .map(({ index }) => index)
    );
  }

  if (state.blankMode === "everyNth") {
    const step = Math.max(2, Math.round(1 / Math.max(0.12, Number(els.difficultyRange.value) / 100)));
    return new Set(eligible.filter((_, index) => index % step === step - 1).map(({ index }) => index));
  }

  if (state.blankMode === "longWords") {
    return new Set(
      eligible
        .sort((a, b) => b.part.length - a.part.length || scoreWord(b.part) - scoreWord(a.part))
        .slice(0, blankCount)
        .map(({ index }) => index)
    );
  }

  return new Set(
    eligible
      .sort((a, b) => scoreWord(b.part) - scoreWord(a.part))
      .slice(0, blankCount)
      .map(({ index }) => index)
  );
}

function makeHint(word) {
  if (state.blankMode === "initialOnly") {
    return `<span class="hint">${escapeHtml(getInitials(word))}</span>`;
  }

  if (!els.firstLetterCheck.checked) return "";
  return `<span class="hint">${escapeHtml(word[0])}</span>`;
}

function getInitials(word) {
  const initials = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  return [...word]
    .map((char) => {
      const code = char.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) return char[0];
      return initials[Math.floor(code / 588)];
    })
    .join("");
}

function scoreWord(word) {
  const commonEndings = /(은|는|이|가|을|를|에|의|와|과|도|로|으로|라|니|며|고|되|하니|하라)$/;
  return word.length * 3 - (commonEndings.test(word) ? 4 : 0) + (/^[0-9]+$/.test(word) ? 1 : 0);
}

function checkAnswers() {
  state.answersChecked = true;
  document.querySelectorAll(".blank-input, .full-verse-input").forEach(markInput);
  if (els.autoRevealCheck.checked) render();
}

function markInput(input) {
  const expected = normalizeAnswer(input.dataset.answer);
  const actual = normalizeAnswer(input.value);
  const correct = actual && actual === expected;
  const wrong = actual.length >= Math.min(expected.length, 2) && actual !== expected;
  input.classList.toggle("correct", correct);
  input.classList.toggle("wrong", wrong);
}

function renderProgress() {
  const total = state.verses.length;
  const done = state.verses.filter((item) => localStorage.getItem(getProgressKey(item.verse)) === "done").length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  els.progressCount.textContent = `${done} / ${total}`;
  els.progressBar.style.width = `${percent}%`;
}

function renderDrill() {
  if (!state.verses.length) {
    els.drillLabel.textContent = "암송 훈련";
    els.drillText.textContent = "구절을 불러오면 한 절씩 집중해서 볼 수 있습니다.";
    return;
  }

  const verse = state.verses[state.focusIndex] || state.verses[0];
  els.drillLabel.textContent = `${state.title} ${verse.verse}절`;
  els.drillText.textContent = verse.text;
}

function moveFocus(delta) {
  if (!state.verses.length) return;
  state.focusIndex = (state.focusIndex + delta + state.verses.length) % state.verses.length;
  renderDrill();
  const target = document.querySelector(`[data-verse="${state.verses[state.focusIndex].verse}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetProgress() {
  state.verses.forEach((item) => localStorage.removeItem(getProgressKey(item.verse)));
  render();
}

function getProgressKey(verse) {
  return `bible.progress.${state.version}.${state.bookId}.${state.chapter}.${verse}`;
}

function getBook() {
  return BibleProvider.books.find((book) => book.id === state.bookId) || BibleProvider.books[0];
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
