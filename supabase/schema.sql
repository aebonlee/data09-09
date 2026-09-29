-- ============================================================================
-- data09-09 — 휠로더 암 감성 기반 Current Ramp Calibration 지원 프로그램
-- Supabase(PostgreSQL) DB 스키마 + RLS
--
--  실행 위치 : 수강생 본인 Supabase 프로젝트의 SQL Editor 에서 실행
--              (Dashboard → SQL Editor → 이 파일 전체를 붙여넣고 Run)
--  재실행    : 안전합니다 (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS 선행)
--
--  지금 도구는 브라우저 localStorage 의 `data09-09.state` 한 칸에 전부 저장합니다.
--  그 안의 묶음을 아래 표로 나눴습니다. 필드 이름은 도구의 이름을 snake_case 로
--  그대로 옮겼고, SQL 예약어와 겹치는 것만 바꿨습니다.
--    values → param_values · from/to → from_value/to_value · user → user_name
--    (버전·Profile 의 id 는 표의 기본키 id 와 겹치므로 version_id·profile_id)
--
--  표 목록
--    workspace            설정 · 현재 작업 중인 16개 값 · 기준 Reference   (1인 1행)
--    calibration_version  저장한 Calibration Set 버전 · 최종 Confirm       (기록성)
--    change_log           파라미터 변경 이력                               (기록성)
--    sensory_label        기준 시험원 감성 라벨 DB
--    acceptance_criteria  Zone×방향×Start/Stop 허용 범위                   (파라미터 16개)
--    mapping_profile      Channel Mapping Profile (이름별 버전)
--    zone_score_weight    Zone별 점수 배율 — 안정도·충격지수·응답성 (Zone 4개, 2026-09-29 추가)
--
--  권한 원칙 : 모든 행은 만든 사람(owner_id = auth.uid())만 보고 고칩니다.
--              기록성 표는 INSERT·SELECT 만 열고 UPDATE·DELETE 는 막습니다.
--  이 스키마는 수강생 본인 프로젝트 전제라 테이블 이름에 접두사를 붙이지 않았습니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 테이블
-- ----------------------------------------------------------------------------

-- 작업 공간 — localStorage 의 settings · values · refVersionId · sample
create table if not exists public.workspace (
  owner_id        uuid primary key default auth.uid(),
  settings        jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(settings) = 'object'),
  param_values    jsonb                                   -- 현재 작업 중인 16개 Ramp 값 (%/s)
                  check (param_values is null or jsonb_typeof(param_values) = 'object'),
  ref_version_id  text not null default '',               -- 기준 Reference 로 지정한 버전
  sample          boolean not null default false,         -- 예시 데이터로 채운 상태인가
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Calibration Set 버전 — 저장할 때마다 한 행. 도구가 고치거나 지우지 않는다.
-- 최종 Confirm(승인) 기록이 들어 있으므로 사후 조작을 막는다.
create table if not exists public.calibration_version (
  id             bigint generated always as identity primary key,
  owner_id       uuid not null default auth.uid(),
  version_id     text not null check (version_id ~ '^V[0-9]{3,}$'),   -- 'V001'
  name           text not null,
  author         text not null default '',
  date           timestamptz not null default now(),
  parent         text not null default ''
                 check (parent = '' or parent ~ '^V[0-9]{3,}$'),
  memo           text not null default '',
  confirmed      boolean not null default false,
  approval_memo  text not null default '',
  param_values   jsonb not null check (jsonb_typeof(param_values) = 'object'),
  created_at     timestamptz not null default now(),
  constraint calibration_version_uniq unique (owner_id, version_id)
);

-- 변경 이력 — 이전값·변경값·변경자·시간·사유. 기록성이라 UPDATE/DELETE 정책 없음.
create table if not exists public.change_log (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  time        timestamptz not null default now(),
  user_name   text not null default '',
  key         text not null
              check (key = '(버전)' or key ~ '^(UP|DOWN)_[1-4]_(start|stop)$'),
  from_value  text,
  to_value    text,
  source      text not null default '',
  reason      text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists change_log_owner_time_idx on public.change_log (owner_id, time desc);

-- 감성 라벨 DB (제출 기획서 9장 저장 항목 그대로)
create table if not exists public.sensory_label (
  id               bigint generated always as identity primary key,
  owner_id         uuid not null default auth.uid(),
  label_id         text not null,
  date             date,
  expert           text not null default '',
  log_name         text not null default '',
  set_version      text not null default '',
  mapping_profile  text not null default '',
  direction        text not null check (direction in ('UP', 'DOWN')),
  zone             int  not null check (zone between 1 and 4),
  event            text not null check (event in ('Start', 'Stop')),
  arm_pct          numeric,
  ramp_value       numeric,
  rpm              numeric,
  payload          numeric,
  oil_temp         numeric,
  response_s       numeric,
  ramp_measured    numeric,
  ramp_unit        text not null default '',
  dp_dt_max        numeric,
  delta_p          numeric,
  pitch_abs        numeric,
  delta_pitch      numeric,
  d2pitch_max      numeric,
  settling_s       numeric,
  shock_index      numeric,
  shock_label      text not null check (shock_label in ('OK', 'NG')),
  pitch_label      text not null check (pitch_label in ('OK', 'NG')),
  resp_label       text not null check (resp_label in ('Too Slow', 'Good', 'Too Aggressive')),
  overall          text not null check (overall in ('Accept', 'Borderline', 'Reject')),
  memo             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- 라벨 파일을 다시 가져오면 같은 label_id 가 두 번 쌓인다. upsert 의 onConflict 는
  -- 'owner_id,label_id' 로 지정할 것.
  constraint sensory_label_uniq unique (owner_id, label_id)
);
create index if not exists sensory_label_key_idx on public.sensory_label (owner_id, direction, zone, event);

-- 허용 범위 — 파라미터 16개마다 한 행 (localStorage 의 criteria 객체)
create table if not exists public.acceptance_criteria (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  param_key   text not null check (param_key ~ '^(UP|DOWN)_[1-4]_(start|stop)$'),
  stab_min    numeric,          -- 안정도 ΔPitch 하한 (°)
  stab_max    numeric,          -- 안정도 ΔPitch 상한 (°)
  shock_max   numeric,          -- Shock Index 상한
  resp_max    numeric,          -- 응답 시간 상한 (s)
  source      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint acceptance_criteria_range check (stab_min is null or stab_max is null or stab_min <= stab_max),
  constraint acceptance_criteria_nonneg check ((shock_max is null or shock_max >= 0) and (resp_max is null or resp_max >= 0)),
  -- upsert onConflict = 'owner_id,param_key'
  constraint acceptance_criteria_uniq unique (owner_id, param_key)
);

-- 안정도 Settling Time 상한 (2026-09-29 추가 — 「settling time 도 안정도 평가의 한 부분」).
-- 이미 만든 표에도 붙도록 ALTER 로 더한다(재실행 안전). 비워 두면 안정도는 ΔPitch 만 본다.
alter table public.acceptance_criteria add column if not exists settle_max numeric;   -- 안정도 Settling Time 상한 (s)
alter table public.acceptance_criteria drop constraint if exists acceptance_criteria_settle_nonneg;
alter table public.acceptance_criteria add constraint acceptance_criteria_settle_nonneg check (settle_max is null or settle_max >= 0);

-- Channel Mapping Profile — 같은 이름으로 저장하면 새 버전이 된다
create table if not exists public.mapping_profile (
  id                 bigint generated always as identity primary key,
  owner_id           uuid not null default auth.uid(),
  profile_id         text not null check (profile_id ~ '^MP-[0-9]{3,}$'),   -- 'MP-001'
  name               text not null check (length(trim(name)) > 0),
  version            int  not null check (version >= 1),
  author             text not null default '',
  confirmed_at       timestamptz,
  mode               text not null check (mode in ('split', 'single')),
  rows               jsonb not null default '{}'::jsonb check (jsonb_typeof(rows) = 'object'),
  cal                jsonb not null default '{}'::jsonb check (jsonb_typeof(cal) = 'object'),
  headers            jsonb not null default '[]'::jsonb check (jsonb_typeof(headers) = 'array'),
  exclude_first_row  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- upsert onConflict = 'owner_id,profile_id,version'
  constraint mapping_profile_uniq unique (owner_id, profile_id, version)
);

-- Zone별 점수 배율 (2026-09-29 수강생 추가 요청 4번) — localStorage 의 settings.zoneWeight
-- 측정값 × 배율 을 허용 상한과 비교한다. 1 = 배율 없음(기본값, 배율 도입 전과 같은 판정).
-- 도구가 받는 범위(0~10)를 CHECK 로도 막는다. 사용자마다 Zone 1~4 네 행.
-- 이 표는 2026-09-29 에 추가했다. 이미 schema.sql 을 한 번 실행한 프로젝트도
-- 이 파일 전체를 다시 실행하면 표·트리거·정책·권한이 함께 붙는다(재실행 안전).
create table if not exists public.zone_score_weight (
  id            bigint generated always as identity primary key,
  owner_id      uuid not null default auth.uid(),
  zone          int  not null check (zone between 1 and 4),
  stab_weight   numeric not null default 1 check (stab_weight  between 0 and 10),   -- 안정도 (ΔPitch)
  shock_weight  numeric not null default 1 check (shock_weight between 0 and 10),   -- 충격지수 (Shock Index)
  resp_weight   numeric not null default 1 check (resp_weight  between 0 and 10),   -- 응답성
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- upsert onConflict = 'owner_id,zone'
  constraint zone_score_weight_uniq unique (owner_id, zone)
);

-- ----------------------------------------------------------------------------
-- 2. 함수 · 트리거
--
--  search_path 를 고정한다. 고정하지 않으면 호출자의 search_path 에 따라
--  엉뚱한 스키마의 객체를 잡을 수 있다.
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $trg$
declare t text;
begin
  foreach t in array array['workspace', 'sensory_label', 'acceptance_criteria', 'mapping_profile', 'zone_score_weight']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end;
$trg$;

-- ----------------------------------------------------------------------------
-- 3. RLS — 본인 행만
-- ----------------------------------------------------------------------------

alter table public.workspace           enable row level security;
alter table public.calibration_version enable row level security;
alter table public.change_log          enable row level security;
alter table public.sensory_label       enable row level security;
alter table public.acceptance_criteria enable row level security;
alter table public.mapping_profile     enable row level security;
alter table public.zone_score_weight   enable row level security;

-- 고치고 지울 수 있는 표 — 네 동작 모두 본인 행만
do $rls$
declare t text;
begin
  foreach t in array array['workspace', 'sensory_label', 'acceptance_criteria', 'mapping_profile', 'zone_score_weight']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
                   t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())',
                   t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
                   t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())',
                   t || '_delete', t);
  end loop;
end;
$rls$;

-- 기록성 표 — INSERT·SELECT 만. UPDATE/DELETE 정책을 두지 않아 사후 조작이 막힌다.
do $rls$
declare t text;
begin
  foreach t in array array['calibration_version', 'change_log']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
                   t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())',
                   t || '_insert', t);
  end loop;
end;
$rls$;

-- ----------------------------------------------------------------------------
-- 4. 표 권한 — Supabase 는 새 표마다 anon 에도 전 권한을 자동으로 붙인다.
--    정책이 anon 을 막지만, 권한 자체도 끊어 두 겹으로 막는다.
-- ----------------------------------------------------------------------------

revoke all on public.workspace, public.calibration_version, public.change_log,
              public.sensory_label, public.acceptance_criteria, public.mapping_profile,
              public.zone_score_weight
  from anon;

grant select, insert, update, delete
  on public.workspace, public.sensory_label, public.acceptance_criteria, public.mapping_profile,
     public.zone_score_weight
  to authenticated;

revoke update, delete, truncate on public.calibration_version, public.change_log from authenticated;
grant select, insert on public.calibration_version, public.change_log to authenticated;

-- ----------------------------------------------------------------------------
-- 5. 함수 실행 권한
--
--  GRANT 만으로는 제한되지 않는다. 권한이 두 겹으로 미리 붙는다.
--    ① PostgreSQL 이 함수 생성 시 PUBLIC 에 EXECUTE 기본 부여
--    ② Supabase 가 ALTER DEFAULT PRIVILEGES 로 신규 함수마다
--       anon·authenticated·service_role 에 자동 부여
--  PUBLIC 만 지우면 anon=X 가 남아 비로그인 호출이 그대로 뚫린다.
--  (RLS 정책 식은 auth.uid() 만 쓰므로 anon 에 남겨 둘 함수가 없다.)
-- ----------------------------------------------------------------------------

revoke all on function public.set_updated_at() from public, anon;
-- 트리거 전용 함수는 authenticated 를 남긴다. 직접 호출하면
-- "can only be called as trigger" 로 죽으므로 무해하다.
grant execute on function public.set_updated_at() to authenticated;

-- ============================================================================
-- 끝.
-- ============================================================================
