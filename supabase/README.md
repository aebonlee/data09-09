# Supabase DB 스크립트

이 폴더에는 이 도구의 저장 데이터를 PostgreSQL(Supabase)로 옮길 때 쓰는 스키마가 들어 있습니다.
지금 도구는 아직 브라우저 저장소(localStorage)만 씁니다.
DB 에 연결하는 코드는 다음 단계에서 붙입니다.

## 왜 DB 가 필요한가

지금은 모든 저장값이 브라우저 localStorage 의 `data09-09.state` 한 칸에 들어 있습니다.
그래서 다음과 같은 한계가 있습니다.

- **라벨 DB 가 한 사람 PC 에 갇힙니다.** 허용 범위와 추천은 기준 시험원이 붙인 Accepted 라벨이 쌓일수록 정확해집니다. 그런데 라벨이 시험원 각자의 브라우저에만 있으면 모아서 볼 수가 없습니다.
- **Calibration 버전과 최종 Confirm 기록이 지워질 수 있습니다.** 브라우저 데이터를 지우거나 PC 를 바꾸면 V001·V002 같은 버전 이력과 승인 메모가 함께 사라집니다. 승인 기록은 사후에 고칠 수 없어야 하는데, 브라우저 저장소는 그것을 보장하지 못합니다.
- **변경 이력이 계속 늘어납니다.** 16개 파라미터를 고칠 때마다 이전값·변경값·변경자·사유가 쌓입니다. localStorage 는 보통 5MB 안팎이라 오래 쓰면 저장이 실패합니다.
- **Mapping Profile 을 다른 PC 에서 다시 쓸 수 없습니다.** 시험장비별 채널맵을 한 번 확정해 두어도 다른 사람은 처음부터 다시 매핑해야 합니다.

로그 원본(CSV)은 용량이 커서 지금처럼 파일로 다시 불러오는 방식을 유지합니다. DB 에는 올리지 않습니다.

## 테이블

| 테이블 | 용도 | localStorage 대응 |
|---|---|---|
| `workspace` | 설정, 현재 작업 중인 16개 Ramp 값, 기준 Reference 버전, 예시 여부 (1인 1행) | `data09-09.state` 의 `settings` · `values` · `refVersionId` · `sample` |
| `calibration_version` | 저장한 Calibration Set 버전과 최종 Confirm·승인 메모 (기록성) | `data09-09.state` 의 `versions[]` |
| `change_log` | 파라미터 변경 이력 (기록성) | `data09-09.state` 의 `history[]` |
| `sensory_label` | 기준 시험원 감성 라벨 DB | `data09-09.state` 의 `labels[]` |
| `acceptance_criteria` | Zone × 방향 × Start/Stop 허용 범위 (파라미터 16개) | `data09-09.state` 의 `criteria{}` |
| `mapping_profile` | Channel Mapping Profile (이름별 버전) | `data09-09.state` 의 `profiles[]` |

필드 이름은 도구의 이름을 snake_case 로 그대로 옮겼습니다.
SQL 예약어와 겹치는 것만 바꿨습니다.

| 도구 | DB |
|---|---|
| `values` | `param_values` |
| `from` · `to` | `from_value` · `to_value` |
| `user` | `user_name` |
| 버전 `id` · Profile `id` | `version_id` · `profile_id` |
| `criteria` 의 `stabMin` 등 | `stab_min` · `stab_max` · `shock_max` · `resp_max` |

`stab_min`(안정도 ΔPitch 하한)은 2026-09-29 수강생 요청으로 도구에서 더 쓰지 않습니다. 칼럼은 nullable 이라 그대로 두고 비워 둡니다.

### 권한

- 모든 표에 RLS(행 수준 보안)를 켰습니다.
- 모든 행은 만든 사람만 보고 고칠 수 있습니다(`owner_id = auth.uid()`). `owner_id` 는 로그인한 사용자로 자동으로 채워집니다.
- `calibration_version` 과 `change_log` 는 기록성 표입니다. 추가와 조회만 되고, 본인도 고치거나 지울 수 없습니다.
- 로그인하지 않은 사용자(anon)는 어떤 표도 읽거나 쓸 수 없습니다.
- 같은 라벨 ID·버전 번호·파라미터·Profile 버전이 두 번 들어가지 않도록 DB 제약(UNIQUE)으로 막습니다. 앱에서 upsert 할 때는 `onConflict` 를 표의 UNIQUE 조합(예: `owner_id,label_id`)으로 지정해야 합니다.

## 적용 방법

1. <https://supabase.com> 에 가입합니다.
2. 새 프로젝트를 만듭니다. 이 도구 전용으로 본인 프로젝트를 쓰는 것을 전제로 하므로 테이블 이름에 접두사를 붙이지 않았습니다.
3. 왼쪽 메뉴에서 **SQL Editor** 를 엽니다.
4. `supabase/schema.sql` 의 내용을 전부 붙여넣습니다.
5. **Run** 을 누릅니다.

여러 번 실행해도 안전합니다. 이미 있는 표는 건너뛰고 정책·트리거는 지우고 다시 만듭니다.

## 확인 방법

1. 왼쪽 메뉴 **Table Editor** 에 위 6개 표가 보이는지 확인합니다.
2. 각 표 이름 옆에 RLS 가 켜져 있는지(「RLS disabled」 경고가 없는지) 확인합니다.
3. **Authentication → Policies** 에서 표마다 정책이 붙어 있는지 봅니다. 기록성 표 2개는 SELECT·INSERT 정책만 있어야 합니다.
4. SQL Editor 에서 아래를 실행해 함수 권한에 `anon` 이 없는지 봅니다.

```sql
select proname, proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';
```

## 앱 연결은 다음 단계입니다

이 스크립트는 표와 권한만 만듭니다. 도구의 `js/store.js` 는 아직 localStorage 를 씁니다.
Supabase 에 저장하려면 다음 단계에서 로그인과 저장·불러오기 코드를 붙여야 합니다.

## 로컬 검증 방법

운영에서 처음 실행하지 않도록, 임시 로컬 PostgreSQL 에 실제로 적용해 검사하는 도구를 함께 두었습니다.

```sh
./scripts/sqltest/run.sh
```

PostgreSQL 16 이상이 필요합니다(macOS: `brew install postgresql@17`).
임시 DB 를 만들어 쓰고 끝나면 지우므로 기존 설치에는 영향이 없습니다.

검사 내용은 다음과 같습니다.

- 스키마를 두 번 적용해도 오류가 없는가
- 사용자 A 의 행이 사용자 B 에게 보이지 않고, 고치거나 지울 수도 없는가
- 로그인하지 않은 사용자는 아무것도 읽거나 쓸 수 없는가
- 기록성 표는 본인도 고치거나 지울 수 없는가
- CHECK·UNIQUE 제약이 잘못된 값과 중복을 막는가
- 함수 실행 권한에 PUBLIC·anon 이 남지 않았는가

검사용 SQL(`scripts/sqltest/*.local.sql`)은 로컬 전용입니다.
Supabase 운영 DB 에서 실행하면 스스로 멈추도록 가드가 들어 있습니다.
