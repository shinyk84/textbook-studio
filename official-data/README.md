# 저장소 포함 공식 전처리 자료

`processed`에는 웹서비스 실행에 필요한 공식자료 5종의 전처리 결과가 들어 있다.
이 폴더는 Git에 포함되므로 새 컴퓨터에서 clone/pull하면 코드와 함께 내려온다.

포함 산출물:

- `document.md`
- `chunks.jsonl`
- `manifest.json`
- `review.csv`
- `report.md`

원본 PDF는 저장소 용량과 배포 범위를 줄이기 위해 포함하지 않는다.

- 원본 PDF가 없어도 전처리 자료를 사용해 모든 제작 단계를 진행할 수 있다.
- 원본 PDF가 `official-data/criteria` 또는 저장소 상위의 `criteria`에 있으면 SHA-256까지 대조한다.
- 원본이 없으면 화면에 `전처리 자료 사용 가능`으로 표시한다.

기존 작업 루트의 `processed`를 다시 반영할 때:

```powershell
python scripts\sync_official_data.py --source-root ..
```

이 명령은 절대경로를 `criteria/<원본 파일명>` 형태로 바꾸고 전처리 내용과 원본 해시는 그대로 보존한다.
