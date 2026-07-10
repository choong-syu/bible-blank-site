# 말씀 빈칸 암송 사이트

시조사 재림성경 페이지에서 장별 본문을 자동 수집해 빈칸 문제와 암송 카드를 만드는 웹앱입니다.

## 실행

자동 수집은 로컬 Node 서버가 필요합니다.

```powershell
cd C:\Users\SYU\Documents\Codex\bible-blank-site
npm start
```

접속 주소:

```text
http://127.0.0.1:5174/
```

## 시조사 수집 방식

서버의 `/api/sijosa?code=Mark&chapter=14`가 내부적으로 아래 페이지를 Chrome으로 열고 `.sentence_txt` 절 본문만 추출합니다.

```text
https://www.sijosa.com/ch21/bible.php?book_idx=451&code=Mark&chapter=14&book_idx2=
```

사이트가 자동화를 차단하면 실제 Chrome 창을 띄우는 방식으로 재시도할 수 있습니다.

```powershell
$env:SIJOSA_HEADFUL='1'
npm start
```

성경 본문 이용은 시조사/재림성경의 이용 조건을 확인한 뒤 개인 학습 또는 허가된 범위에서 사용하세요.

## 저장 방식

한 번 불러온 장은 서버의 `data/chapters.json`에 저장됩니다. 이후 같은 사이트에 접속한 사용자는 왼쪽 `저장된 장` 목록에서 바로 열 수 있습니다.

API:

```text
GET  /api/chapters
POST /api/chapters
GET  /api/sijosa?code=Mark&chapter=14
```

## 기능

- 성경 66권/장 선택 UI
- 시조사 재림성경 자동 수집
- 수집한 장을 서버에 저장하고 모든 접속자에게 목록 표시
- 직접 붙여넣은 본문 저장 및 재사용
- 읽기, 암송, 빈칸 모드
- 난이도별 자동 빈칸 생성
- 핵심 단어, 무작위, 규칙적 간격, 긴 단어, 초성 힌트, 절 전체 입력 방식
- 첫 글자 힌트
- 절 번호 가리기
- 한 절씩 넘기는 암송 훈련 패널
- 정답 확인과 원문 표시
- 구절 듣기
- 암송 완료 진행률 저장
