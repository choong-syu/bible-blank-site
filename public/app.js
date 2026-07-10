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
  blankSeed: Date.now(),
  focusIndex: 0,
  checkedVerses: new Set(),
  wrongReviewOnly: false,
  wrongNotes: []
};

const els = {
  versionSelect: document.querySelector("#versionSelect"),
  bookSelect: document.querySelector("#bookSelect"),
  chapterSelect: document.querySelector("#chapterSelect"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  randomBlankBtn: document.querySelector("#randomBlankBtn"),
  wrongReviewBtn: document.querySelector("#wrongReviewBtn"),
  clearWrongNotesBtn: document.querySelector("#clearWrongNotesBtn"),
  refreshSavedBtn: document.querySelector("#refreshSavedBtn"),
  savedChapterList: document.querySelector("#savedChapterList"),
  difficultyRange: document.querySelector("#difficultyRange"),
  difficultyValue: document.querySelector("#difficultyValue"),
  blankModeSelect: document.querySelector("#blankModeSelect"),
  hideRefsCheck: document.querySelector("#hideRefsCheck"),
  firstLetterCheck: document.querySelector("#firstLetterCheck"),
  lengthHintCheck: document.querySelector("#lengthHintCheck"),
  sourceLabel: document.querySelector("#sourceLabel"),
  chapterTitle: document.querySelector("#chapterTitle"),
  progressCount: document.querySelector("#progressCount"),
  progressBar: document.querySelector("#progressBar"),
  messageBox: document.querySelector("#messageBox"),
  verseList: document.querySelector("#verseList"),
  modeTabs: document.querySelectorAll(".mode-tabs button")
};

function init() {
  renderBooks();
  state.wrongNotes = loadWrongNotes();
  bindEvents();
  updateChapters();
  loadSavedChapters();
  loadSelectedChapter();
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
    state.wrongReviewOnly = false;
    loadSelectedChapter();
  });

  els.bookSelect.addEventListener("change", () => {
    state.bookId = els.bookSelect.value;
    state.chapter = 1;
    state.wrongReviewOnly = false;
    updateChapters();
    loadSelectedChapter();
  });

  els.chapterSelect.addEventListener("change", () => {
    state.chapter = Number(els.chapterSelect.value);
    state.wrongReviewOnly = false;
    loadSelectedChapter();
  });

  els.refreshSavedBtn.addEventListener("click", loadSavedChapters);
  els.shuffleBtn.addEventListener("click", () => {
    state.shuffled = !state.shuffled;
    render();
  });
  els.randomBlankBtn.addEventListener("click", () => {
    randomizeChapterBlanks();
    render();
  });
  els.wrongReviewBtn.addEventListener("click", toggleWrongReview);
  els.clearWrongNotesBtn.addEventListener("click", () => {
    state.wrongNotes = [];
    state.wrongReviewOnly = false;
    saveWrongNotes();
    render();
  });

  els.difficultyRange.addEventListener("input", () => {
    els.difficultyValue.textContent = `${els.difficultyRange.value}%`;
    render();
  });

  els.blankModeSelect.addEventListener("change", () => {
    state.blankMode = els.blankModeSelect.value;
    state.checkedVerses.clear();
    render();
  });

  els.hideRefsCheck.addEventListener("change", render);
  els.firstLetterCheck.addEventListener("change", render);
  els.lengthHintCheck.addEventListener("change", render);

  els.modeTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.checkedVerses.clear();
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
      state.wrongReviewOnly = false;
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
    state.blankSeed = Date.now();
    state.focusIndex = 0;
    state.checkedVerses.clear();
    await loadSavedChapters();
    render();
  } catch (error) {
    setMessage("본문을 불러오지 못했습니다.", error.message);
    state.verses = [];
    render();
  }
}

function render() {
  updateWrongNoteControls();
  els.chapterTitle.textContent = state.wrongReviewOnly ? "오답노트 복습" : state.title || "저장된 장을 고르거나 새 장을 불러오세요";
  els.sourceLabel.textContent = state.wrongReviewOnly ? `${state.wrongNotes.length}개 절 다시 풀기` : state.source || "본문 대기 중";
  els.difficultyValue.textContent = `${els.difficultyRange.value}%`;
  renderProgress();

  const visibleVerses = getVisibleVerses();
  if (!visibleVerses.length) {
    els.verseList.innerHTML = "";
    if (state.wrongReviewOnly) setMessage("오답노트가 비었습니다.", "틀린 절이 생기면 오답노트만 다시 풀 수 있습니다.");
    els.messageBox.classList.remove("hidden");
    return;
  }

  els.messageBox.classList.add("hidden");
  els.verseList.innerHTML = visibleVerses.map(renderVerseCard).join("");
  bindVerseActions();
}

function getVisibleVerses() {
  if (state.wrongReviewOnly) return state.wrongNotes;
  return state.shuffled ? shuffle([...state.verses]) : state.verses;
}

function renderVerseCard(item) {
  const refText = els.hideRefsCheck.checked ? "" : `${item.title || state.title} ${item.verse}절`;
  const body = renderVerseBody(item);
  const wrongFlag = isWrongNote(item) ? `<p class="wrong-note-flag">오답노트 필요</p>` : "";
  const actions = state.mode === "read"
    ? `<div class="verse-actions"><button data-action="speak" type="button">듣기</button></div>`
    : `<div class="verse-actions"><button data-action="check-verse" type="button">정답 체크</button><button data-action="reset-verse" type="button">빈칸 초기화</button></div>`;

  return `
    <article class="verse-card${isWrongNote(item) ? " needs-review" : ""}" data-verse="${item.verse}" data-key="${escapeHtml(getVerseKey(item))}">
      <div class="verse-head">
        <span class="ref">${refText}</span>
        ${actions}
      </div>
      ${wrongFlag}
      ${body}
    </article>
  `;
}

function renderVerseBody(item) {
  if (state.mode === "quiz") {
    const original = state.checkedVerses.has(getVerseKey(item))
      ? makeAnswerLine(item)
      : "";
    return `<div class="quiz-line">${makeQuizTokens(item.text, item.verse).join("")}</div>${original}`;
  }

  return `<p class="verse-text">${makeReadTokens(item).join("")}</p>`;
}

function bindVerseActions() {
  const visibleVerses = getVisibleVerses();
  document.querySelectorAll(".verse-card").forEach((card) => {
    const verse = visibleVerses.find((item) => getVerseKey(item) === card.dataset.key);
    const speakButton = card.querySelector('[data-action="speak"]');
    if (speakButton) speakButton.addEventListener("click", () => speak(verse.text));

    const checkButton = card.querySelector('[data-action="check-verse"]');
    if (checkButton) checkButton.addEventListener("click", () => checkVerse(card, verse));

    const resetButton = card.querySelector('[data-action="reset-verse"]');
    if (resetButton) resetButton.addEventListener("click", () => resetVerse(card, verse));
  });
}

function makeQuizTokens(text, verseNumber) {
  const blankPercent = Number(els.difficultyRange.value) / 100;
  const parts = text.match(/[가-힣A-Za-z0-9]+|[^\s가-힣A-Za-z0-9]+|\s+/g) || [];
  const eligible = parts
    .map((part, index) => ({ part, index }))
    .map((item) => ({ ...item, noun: analyzeNounToken(item.part) }))
    .filter(({ noun }) => noun);
  const blankCount = Math.round(eligible.length * blankPercent);
  const blankIndexes = chooseBlankIndexes(eligible, blankCount, verseNumber);

  return parts.map((part, index) => {
    if (!blankIndexes.has(index)) return `<span>${escapeHtml(part)}</span>`;
    const noun = eligible.find((item) => item.index === index).noun;
    const placeholder = makeNounHint(noun.answer);
    const widthBasis = placeholder || noun.answer;
    const width = Math.min(190, Math.max(82, [...widthBasis].length * 24));
    return `<span class="blank-wrap"><input class="blank-input" style="width:${width}px" data-answer="${escapeHtml(noun.answer)}" data-token-index="${index}" placeholder="${escapeHtml(placeholder)}" aria-label="명사 빈칸 정답 입력" />${noun.suffix ? `<span class="blank-suffix">${escapeHtml(noun.suffix)}</span>` : ""}</span>`;
  });
}

function makeReadTokens(item) {
  const wrongNote = getWrongNote(item);
  const wrongIndexes = new Set((wrongNote?.wrongIndexes || []).map(Number));
  const wrongWords = new Set(wrongNote?.wrongWords || []);
  const parts = item.text.match(/[가-힣A-Za-z0-9]+|[^\s가-힣A-Za-z0-9]+|\s+/g) || [];

  return parts.map((part, index) => {
    const noun = analyzeNounToken(part);
    if (!noun) return escapeHtml(part);

    const markedWrong = wrongIndexes.has(index) || (!wrongIndexes.size && wrongWords.has(noun.answer));
    const nounHtml = `<strong class="read-noun">${escapeHtml(noun.answer)}</strong>`;
    const markedNoun = markedWrong
      ? `<span class="read-wrong-noun"><span class="read-wrong-label">오답</span>${nounHtml}</span>`
      : nounHtml;
    return `${markedNoun}${escapeHtml(noun.suffix)}`;
  });
}

function chooseBlankIndexes(eligible, blankCount, verseNumber) {
  if (!blankCount) return new Set();
  return new Set(
    seededShuffle(eligible, state.blankSeed + verseNumber)
      .slice(0, blankCount)
      .map(({ index }) => index)
  );
}

function randomizeChapterBlanks() {
  state.blankSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  state.checkedVerses.clear();
  state.mode = "quiz";
  els.modeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === "quiz"));
}

function analyzeNounToken(token) {
  if (!/^[가-힣]+$/.test(token)) return null;

  const suffixes = [
    "이라도", "이라고", "이라면", "이라서", "이라",
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
  if (!word) return false;
  if ([...word].length < 2) return isKnownNoun(word);
  if (["너희", "우리", "그들", "자기", "어디", "무엇", "아무"].includes(word)) return false;
  if (/(하기|되기|가기|오기|먹기|보기|주기|받기|말하기|준비하기)$/.test(word)) return false;
  if (/(하는|하신|하실|하였|하려|되어|되는|되신|되게)$/.test(word)) return false;
  if (/[하되시었였겠더라니며고서]$/.test(word)) return false;
  return true;
}

function isKnownNoun(word) {
  return [
    "예수", "그리스도", "하나님", "성령", "아버지", "주", "복음", "말씀", "제자", "베드로", "요한", "야고보", "유다",
    "갈릴리", "예루살렘", "성전", "대제사장", "서기관", "바리새인", "사람", "무리", "천국", "하늘", "땅", "믿음", "사랑", "죄", "생명", "진리",
    "이틀", "유월절", "무교절", "민란", "명절", "베다니", "나병환자", "시몬", "집", "때", "여자", "향유", "나드", "옥합", "머리",
    "화", "데나리온", "이상", "자", "일", "힘", "몸", "장례", "흉계", "방도", "천하", "곳", "기억", "열둘", "중", "가룟",
    "돈", "첫날", "양", "날", "둘", "물", "성내", "주인", "객실", "자리", "음식", "떡", "잔", "언약", "피", "포도나무",
    "소산", "나라", "감람산", "목자", "오늘", "밤", "닭", "번", "겟세마네", "기도", "아바", "뜻", "입", "군대", "표",
    "랍비", "검", "강도", "성경", "청년", "홑이불", "공회", "증거", "손", "사흘", "증언", "침묵", "찬송", "얼굴",
    "아래뜰", "여종", "나사렛", "생각"
  ].includes(word);
}

function makeNounHint(answer) {
  const chars = [...answer];
  const stars = els.lengthHintCheck.checked ? "*".repeat(els.firstLetterCheck.checked ? Math.max(0, chars.length - 1) : chars.length) : "";
  if (els.firstLetterCheck.checked) return `${chars[0]}${stars}`;
  return stars;
}

function checkVerse(card, verse) {
  card.querySelectorAll(".blank-input").forEach(markInput);
  state.checkedVerses.add(getVerseKey(verse));
  const wrongInputs = [...card.querySelectorAll(".blank-input.wrong")];
  const hasWrong = Boolean(wrongInputs.length);
  const wrongWords = [...new Set(wrongInputs.map((input) => input.dataset.answer).filter(Boolean))];
  const wrongIndexes = [...new Set(wrongInputs.map((input) => Number(input.dataset.tokenIndex)).filter(Number.isFinite))];
  setWrongNote(verse, hasWrong, { wrongWords, wrongIndexes });
  renderWrongNoteFlag(card, hasWrong);
  updateWrongNoteControls();

  if (!card.querySelector(".answer-line")) {
    card.insertAdjacentHTML("beforeend", makeAnswerLine(verse));
  }
}

function resetVerse(card, verse) {
  card.querySelectorAll(".blank-input").forEach((input) => {
    input.value = "";
    input.classList.remove("correct", "wrong");
  });
  state.checkedVerses.delete(getVerseKey(verse));
  card.querySelector(".answer-line")?.remove();
}

function markInput(input) {
  const expected = normalizeAnswer(input.dataset.answer);
  const actual = normalizeAnswer(input.value);
  const correct = Boolean(expected) && actual === expected;
  const wrong = !correct;
  input.classList.toggle("correct", correct);
  input.classList.toggle("wrong", wrong);
}

function makeAnswerLine(item) {
  const parts = item.text.match(/[가-힣A-Za-z0-9]+|[^\s가-힣A-Za-z0-9]+|\s+/g) || [];
  const eligible = parts
    .map((part, index) => ({ part, index }))
    .map((entry) => ({ ...entry, noun: analyzeNounToken(entry.part) }))
    .filter(({ noun }) => noun);
  const blankPercent = Number(els.difficultyRange.value) / 100;
  const blankCount = Math.round(eligible.length * blankPercent);
  const blankIndexes = chooseBlankIndexes(eligible, blankCount, item.verse);

  const html = parts.map((part, index) => {
    if (!blankIndexes.has(index)) return escapeHtml(part);
    const noun = eligible.find((entry) => entry.index === index).noun;
    return `<strong class="answer-word">${escapeHtml(noun.answer)}</strong>${escapeHtml(noun.suffix)}`;
  }).join("");

  return `<p class="answer-line">${html}</p>`;
}

function renderWrongNoteFlag(card, show) {
  card.classList.toggle("needs-review", show);
  card.querySelector(".wrong-note-flag")?.remove();
  if (show) {
    card.querySelector(".verse-head").insertAdjacentHTML("afterend", `<p class="wrong-note-flag">오답노트 필요</p>`);
  }
}

function setWrongNote(verse, shouldSave, detail = {}) {
  const key = getVerseKey(verse);
  state.wrongNotes = state.wrongNotes.filter((item) => getVerseKey(item) !== key);

  if (shouldSave) {
    state.wrongNotes.push({
      key,
      version: state.version,
      code: verse.code || state.bookId,
      chapter: Number(verse.chapter || state.chapter),
      title: verse.title || state.title,
      verse: verse.verse,
      text: verse.text,
      wrongWords: detail.wrongWords || [],
      wrongIndexes: detail.wrongIndexes || []
    });
  }

  saveWrongNotes();
}

function isWrongNote(verse) {
  return Boolean(getWrongNote(verse));
}

function getWrongNote(verse) {
  const key = getVerseKey(verse);
  return state.wrongNotes.find((item) => getVerseKey(item) === key);
}

function getVerseKey(verse) {
  return verse.key || `${verse.code || state.bookId}:${Number(verse.chapter || state.chapter)}:${verse.verse}`;
}

function loadWrongNotes() {
  try {
    const notes = JSON.parse(localStorage.getItem("bible.wrongNotes") || "[]");
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

function saveWrongNotes() {
  localStorage.setItem("bible.wrongNotes", JSON.stringify(state.wrongNotes));
}

function updateWrongNoteControls() {
  els.wrongReviewBtn.textContent = state.wrongReviewOnly ? `전체 장으로 돌아가기 (${state.wrongNotes.length})` : `오답노트만 풀기 (${state.wrongNotes.length})`;
  els.wrongReviewBtn.disabled = !state.wrongReviewOnly && !state.wrongNotes.length;
  els.clearWrongNotesBtn.disabled = !state.wrongNotes.length;
}

function toggleWrongReview() {
  if (state.wrongReviewOnly) {
    state.wrongReviewOnly = false;
  } else if (state.wrongNotes.length) {
    state.wrongReviewOnly = true;
    state.mode = "quiz";
    state.checkedVerses.clear();
    els.modeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === "quiz"));
  }
  render();
}

function renderProgress() {
  const total = getVisibleVerses().length;
  const percent = total ? 100 : 0;
  els.progressCount.textContent = `${total}절`;
  els.progressBar.style.width = `${percent}%`;
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
