# data09-09 · 로더 암 Current Ramp Calibration

베테랑 시험인원 감성 기준으로 암 위치·조작방향별 충격·응답성을 자동 판정하고 구간별 current ramp 파라미터를 조정·추천하는 오프라인 캘리브레이션 도구

| 항목 | 내용 |
|---|---|
| 제출자 | 이영우 |
| 과정 | 현장 데이터 수집·디지털화 전문가과정 1차수 (2026) |
| 진행 단계 | 1단계 개발 완료 (2026-09-28), 2026-09-29 추가 요청 6건·확인 답변 반영 — https://aebonlee.github.io/data09-09/ |
| 다음 개발 | 2단계 — 실제 `sample data.csv`·라벨로 Threshold·Shock Index·허용 범위 확정, 실제 파라미터 사양(명칭·Min/Max·ECU 환산) 반영, 학습 기반 추천·MDF/CAN 로그 Import |

## 이 저장소 이용 안내

이 저장소는 수강생 본인의 과제입니다. **Fork 하거나 「Code → Download ZIP」으로 받아 가셔도 됩니다.**
강의 종료 후 일정 기간이 지나면 비공개로 전환되니, 계속 쓰실 분은 그 전에 받아 두세요.

## 문서

- [프로젝트 기획서 (Markdown)](docs/01_프로젝트_기획서.md)
- [프로젝트 기획서 (Word, docx)](docs/01_프로젝트_기획서.docx)
- [패들릿 제출 원문](docs/source/패들릿_제출_원문.md)
- [2026-09-29 패들릿 추가 요청](docs/source/2026-09-29_패들릿_추가요청.md)

## 제출 자료 (`docs/source/`)

- `01_______Current_Ramp_Calibration_________.docx` — 처음 올린 첨부. DRM 암호화(머리글 HHIDRMC)라 열리지 않았습니다
- `02_Current_Ramp_Calibration_개발기획서_0834.docx` — 보안 해제본 개발 기획서 (2026-09-28 08:34)
- `03_Current_Ramp_Calibration_개발기획서_ChannelMapping_0930.docx` — 같은 기획서의 최신판, Channel Mapping 절 추가 (2026-09-28 09:30, **정본**)
- `02_그림1_메인UI_스케치.jpg` — 기획서 안의 사용자 제안 메인 UI 스케치

## 진행 순서

1. 기획서 확정 — 수강생 확인 후 v1.0
2. 1단계 개발 — 지금 있는 자료로 만들 수 있는 부분부터
3. 수강생 실제 데이터로 검증 · 보완

## 실행 방법

**온라인에서 바로 쓰기: https://aebonlee.github.io/data09-09/**

내 PC에서 쓰려면 설치 없이 아래 두 방법 중 하나로 엽니다. 제출자가 요청한 「오프라인」(인터넷 없는 PC, 장비와 연결하지 않는 분석 전용)을 그대로 만족합니다.

1. **파일로 바로 열기** — 이 폴더(Code → Download ZIP 으로 받은 것)의 `index.html` 을 더블클릭해 크롬·엣지로 엽니다. 인터넷이 없어도 동작합니다(엑셀 라이브러리도 `vendor/` 에 들어 있습니다).
2. **간이 서버로 열기** — 폴더에서 `python3 -m http.server 8000` 을 실행하고 브라우저에서 `http://localhost:8000` 을 엽니다.

사용 순서

1. 「로그·Channel Mapping」에서 로그 CSV(또는 Excel)를 올립니다. 처음 써 보려면 **「예시 데이터 불러오기」** 를 누릅니다(화면 위에 「예시 데이터」 안내 띠가 뜹니다).
2. 표준 신호마다 CSV 헤더·단위·Current 역할(Command/Actual)을 확인하고 「확인」을 체크한 뒤 **Mapping Confirm → 분석 시작**. 전류 % 보정(I0·I100)을 넣지 않으면 mA/s 로만 비교하고 추천은 막힙니다.
3. 이벤트 표에서 행을 누르면 「Calibration」 화면에서 그 Zone·방향의 Ramp 와 판정표가 열립니다. 그래프 핸들 드래그 · 기울기 입력 · Parameter 값 입력 중 편한 방식으로 고치고, 우측 추천은 「적용」을 눌러야 반영됩니다.
4. 「Calibration Set 저장」으로 버전을 남기고, 「Parameter Export」로 CSV·Excel·JSON 을 내보내 장비에 적용합니다(ECU 직접 Write 없음). 재시험 로그를 다시 올려 비교합니다.

- 파라미터·버전·이력·라벨·허용 범위·Mapping Profile·설정은 **이 브라우저(localStorage)에만** 저장됩니다. 로그 원본은 저장하지 않으니 다시 열면 파일을 다시 올립니다. 보관·이동은 「설정·데이터」의 전체 백업(JSON)으로 합니다.
- 예시 파일(`samples/`): `예시데이터_시험로그1_V001.csv`, `예시데이터_시험로그2_V002.csv`, `예시데이터_시험로그3_실제열순서.csv`(2026-09-29 메일로 받은 실제 로그와 같은 열 이름·순서 — 값은 가상, 「예시 데이터 불러오기」에서는 자동추천부터 시작), `예시데이터_라벨DB.csv`, `예시데이터_CalibrationSet_V001.csv`. **모두 합성(가상) 데이터**입니다. 로그의 열 이름만 제출 기획서 4.3 의 `sample data.csv` 헤더 8개를 그대로 썼고 값은 단순 가상 물리 모델로 만들었습니다. 라벨은 가상 규칙으로 붙인 것이라 실제 감성 기준이 아닙니다.
- 수강생이 보낸 **실제 로그 원본은 실측 데이터라 이 리포에 넣지 않았습니다.** 도구에 올려 본 결과(자동 매핑·이벤트 28개)는 기획서 11장에 있습니다.
- 설정 화면의 기본값(파라미터 Min/Max·Step, 검출 Threshold, Shock Index 식의 기준값·가중치, CAUTION 폭 등)은 모두 **가정**입니다. 실제 사양·로그를 받으면 바꿉니다.
- 로직 테스트: `node test/logic.test.mjs` (의존성 없음) · 예시 파일 다시 만들기: `node scripts/make-samples.js`

## 1단계 구현 범위

기획서 5장 기능 목록 기준입니다. 완료 = 이번 1단계 도구에 들어감, 다음 단계 = 기획서 8장 2·3단계. 괄호는 제출 기획서의 완료 기준(AC) 번호입니다.

| 기능 (기획서 5장) | 상태 | 1단계에서 한 것 / 남은 것 |
|---|---|---|
| 16개 Ramp 파라미터 관리 | 완료 | 암 업/다운 탭 × Zone 1~4, Start/Stop(End) 값, 16개 전체표. 100% Endpoint = Zone 4 값 표시 (AC-01, AC-02) |
| Ramp Profile 그래프 편집 | 완료 | X축 Time/정규화 Phase, Y축 Current(%), Start·Stop 구간 음영과 선분 위 %/s. ① 핸들 드래그(키보드 화살표 포함) ② 기울기 입력 ③ Parameter(ECU) 값 입력이 즉시 서로 맞춰짐 (AC-03). ECU 값 환산은 배율 하나로 가정 |
| 편집 안전장치 | 완료 | Undo/Redo, 직전 적용값·기준 Profile 값 복원, Min/Max·Step 오류는 저장·Export 차단, Zone 경계 연속성 경고는 확인 후 저장 |
| 비교 Overlay | 완료 | 현재값·직전값·기준 Reference·추천값을 선 스타일·범례로 구분(색만으로 구분하지 않음) |
| 로그 Import | 완료 | CSV·Excel 여러 개, 파일 요약(행·채널·시간 범위·Δt 중앙값). MDF·CAN(DBC) 직접 읽기는 2단계 |
| Channel Mapping | 완료 | 원문 헤더 드롭다운, 별칭·단위·값 범위로 자동추천과 이유, 동점은 「확인 필요」, 중복 연결 경고, 행별 원단위·분석단위·미리보기·확인, UP/DOWN 분리·단일 Current 모드와 Command/Actual 역할, 압력 단위 미추정, 전류 % 선형 보정. 확인 전 Confirm·분석 차단 (AC-13~16) |
| 데이터 검증 | 완료 | 결측·숫자 변환 실패·연속 결측 위치, 고정값, Arm 0~100% 밖, 시간 역전·중복, Δt 최소/중앙값/최대, Sampling 공백, 첫 행 전 채널 0 경고(자동 삭제 없음, 제외 선택 기록). 문제 구간 이벤트는 NO DATA (AC-17) |
| Mapping Profile | 완료 | 저장(버전), 같은 구조 파일에서 제안 상태로 복원·변경 강조·재확정, 분석 결과·라벨·Excel 에 Profile 버전과 변환식 기록 (AC-18) |
| 파생 신호 생성 | 완료 | 이동평균 + 중앙차분으로 d(Arm%)/dt, dCurrent/dt, dP/dt, dPitch/dt, d²Pitch/dt², 계산·검출 Version 표시 (AC-10) |
| Movement Start/Stop 검출 | 완료 | Start/Stop Threshold(hysteresis)·Hold Time, 이벤트 시점 Arm % 로 Zone, 부호로 UP/DOWN, 분석 Window (AC-04). 초기값은 가정 |
| 시간 동기 Track 그래프 | 완료 | Arm %·Current UP/DOWN·Head P·Pitch 와 선택 파생 신호를 같은 시간축의 별도 트랙으로, Zone 경계선·이벤트 Marker·Window 음영 (AC-12) |
| 이벤트 Feature · 판정 | 완료 | Response Delay/Stop Response Time, 실측 Ramp, ΔP·dP/dt, Pitch·ΔPitch·dPitch/dt·d²Pitch/dt², Settling, Shock Index(가정 식). 판정표는 스케치대로 안정도·충격지수·응답성·종합. DOWN Pitch 별도 표시 (AC-05) |
| 기준 시험원 Profile · 라벨 DB | 완료 | 16개 파라미터별 허용 범위 입력·가져오기·내보내기, 이벤트 라벨 기록(충격감·Pitch감·응답성·전체·메모·시험 Set), 라벨 파일 가져오기/내보내기, Accepted 라벨로 허용 범위 만들기(ΔPitch·Shock Index·응답 시간 상한 — 안정도 하한은 2026-09-29 요청으로 삭제) |
| 차트 커서 (2026-09-29 요청) | 완료 | 로그 탭 트랙·Calibration 탭 이벤트 트랙·Ramp Profile 에 Tracking(수직 커서 1개, 모든 트랙 동기화)·Value Difference(커서 A·B, Δy·Δx) 모드. 마우스·터치 드래그, 화살표 키, 값은 선형 보간 |
| Zone별 점수 배율 (2026-09-29 2차 요청) | 완료 | 설정 화면 표(Zone 1~4 × 안정도·충격지수·응답성)와 Calibration 판정표 위 입력칸. 측정값 × 배율을 상한과 비교, 항목 점수 = 적용값 ÷ 상한 × 100, 종합 점수 = 가장 큰 항목 점수. 기본 1 = 이전과 같은 판정(테스트로 보장). 백업·이벤트 CSV/Excel 에 포함, `supabase/schema.sql` 의 `zone_score_weight` |
| 결과 표 머리줄 고정 (2026-09-29 2차 요청) | 완료 | 로그 탭의 불러온 로그·Channel Mapping·이벤트 결과 표와 라벨 DB·변경 이력 표는 표 안에서 스크롤하고 머리줄은 고정. 좁은 화면 가로 스크롤과 함께 동작 |
| 안정도에 Settling Time 편입 (2026-09-29 요청) | 완료 | 안정도 점수 = max(ΔPitch 점수, Settling 점수), 길수록 저하. Band = max(0.015°, 0.2 × Pitch Peak-to-Peak) — 실제 로그의 작은 Pitch 변화에 맞춤. 허용 범위에 Settling 상한 칸, 비우면 예전처럼 ΔPitch 만 |
| 장비 기본값 (2026-09-29 수강생 확정) | 완료 | 자동추천이 헤더에 없을 때 Head Pressure bar · EPPR Command · 전류 보정 I0 0 / I100 650 mA 를 채움(설정에서 바꿈, 행별 「확인」은 그대로) |
| 설정 설명 말풍선 (2026-09-29 요청) | 완료 | 설정·데이터 화면 소제목 7곳 옆 i 아이콘 — 마우스 올림·키보드 초점·모바일 탭으로 파라미터 뜻 표시(기획서·코드 정의에서 옮김) |
| 판정 상태 | 완료 | PASS / CAUTION / FAIL-SHOCK / FAIL-PITCH / FAIL-SLOW / NO DATA, Safety Limit 우선(초과 시 최종 Confirm 차단) (AC-06) |
| 추천 Side Panel (Rule 기반) | 완료 | Accepted 라벨 ramp 값의 상위 백분위 쪽으로, 1회 변화폭·Min/Max·Step 안에서. 근거 부족은 「추천 불가/데이터 부족」, 「적용」 전 값 불변, 전류 % 보정 없으면 차단 (AC-07, AC-09) |
| Calibration Version 관리 | 완료 | 저장(부모 버전·작성자·사유·최종 Confirm·승인메모), 복원, 기준 지정, 현재/기준/이전/추천 비교, 변경 이력 CSV, Set CSV·Excel·JSON 내보내기·가져오기 (AC-08, AC-11) |
| MDF·CAN 원시 로그 직접 읽기 | 다음 단계 | 2단계 (DBC 필요) |
| 복수 로그 일괄 비교 · Trend | 다음 단계 | 2단계 |
| 복수 기준 시험원 · Consensus Profile | 다음 단계 | 3단계 |
| 확률·선호 학습 추천 | 다음 단계 | 2·3단계 (라벨 데이터가 쌓인 뒤) |
| 조향 Ramp Calibration | 다음 단계 | 3단계 |

개발 기록: [docs/개발일지.md](docs/개발일지.md)

