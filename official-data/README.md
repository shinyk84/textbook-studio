# 저장소 포함 공식 전처리 자료

`processed`에는 웹서비스 실행에 필요한 공식 기준·교육과정 13종, 스포츠 문화 교과서·지도서 10종, 초등 체육 5학년 교과서·지도서 6종 등 총 29종의 전처리 결과가 들어 있다.
이 폴더는 Git에 포함되므로 새 컴퓨터에서 clone/pull하면 코드와 함께 내려온다.

- 2009 개정: 초·중등학교 교육과정 총론 1종, 체육과 교육과정 2개 판본, YBM 스포츠 문화 교과서·지도서 각 1종
- 2022 개정: 공식 기준·교육과정 10종, 천재·지학사·동아출판·미래엔 스포츠 문화 교과서 4종과 지도서 4종
- 2022 개정 초등 체육 5학년: YBM·동아출판·천재교과서 교과서 3종과 지도서 3종(5~6학년군 교육과정, 검정도서 비교 자료)
- `manifest.json`과 검색 청크의 `curriculum_revision`으로 2009/2022 개정을 구분한다.

포함 산출물:

- `document.md`
- `chunks.jsonl`
- `manifest.json`
- `review.csv`
- `report.md`

교과서·지도서 전처리 폴더에는 위 파일 외에도 `pages.jsonl`, `spreads.jsonl`, `spread_chunks.jsonl`, 페이지·펼침면 미리보기 이미지가 포함된다.

원본 PDF·HWP·HWPX는 저장소 용량과 배포 범위를 줄이기 위해 포함하지 않는다.

- 원본 PDF가 없어도 전처리 자료를 사용해 모든 제작 단계를 진행할 수 있다.
- 원본 PDF가 `official-data/criteria`, `official-data/textbook`, `official-data/teacher_guide` 또는 저장소 상위의 `criteria`에 있으면 SHA-256까지 대조한다.
- 원본이 없으면 화면에 `전처리 자료 사용 가능`으로 표시한다.
- HWP/HWPX 전처리 자료는 문단 순서를 보존하지만 원본 쪽수를 자동 확정하지 않으므로 최종 인용 시 원본 대조가 필요하다.

새 PDF·HWP·HWPX를 전처리할 때:

```powershell
python scripts\preprocess_official_documents.py <원본 파일 경로>
```

교과서·지도서 PDF 6종을 페이지·펼침면 규격으로 전처리할 때:

```powershell
python scripts\preprocess_textbook_guides.py
```

원본은 Git에 포함하지 않는다. 공식 기준은 `official-data/criteria/<09개정|22개정>`, 교과서와 지도서는 각각 `official-data/textbook`, `official-data/teacher_guide`에 로컬 보관한다.

기존 작업 루트의 `processed`를 다시 반영할 때:

```powershell
python scripts\sync_official_data.py --source-root ..
```

이 명령은 절대경로를 `criteria/<원본 파일명>` 형태로 바꾸고 전처리 내용과 원본 해시는 그대로 보존한다.
