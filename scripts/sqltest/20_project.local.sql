-- ============================================================================
-- 로컬 검증 전용 — data09-09 프로젝트별 검증 (운영 실행 금지, 가드 내장)
--
--  사용자 A·B 두 명과 비로그인(anon)을 번갈아 흉내 내어
--  ① 본인 행만 보이는가 ② anon 은 아무것도 못 하는가
--  ③ 기록성 표는 고치거나 지울 수 없는가 ④ CHECK·UNIQUE 가 걸리는가
--  ⑤ 함수 권한에 PUBLIC·anon 이 남지 않았는가 를 잰다.
-- ============================================================================

do $guard$
begin
  if exists (select 1 from pg_roles where rolname in ('supabase_admin', 'authenticator'))
     or exists (select 1 from pg_namespace where nspname = 'graphql') then
    raise exception '이 파일은 로컬 검증 전용입니다. 운영 데이터베이스에서 실행할 수 없습니다.';
  end if;
end;
$guard$;

-- 지정한 SQLSTATE 로 실패해야 통과. 현재 역할(invoker)로 실행된다.
create or replace function public._assert_raises(p_sql text, p_state text, p_label text)
returns void language plpgsql set search_path = public as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then raise notice '  OK   %', p_label; return; end if;
    raise exception 'FAIL  %  (기대 SQLSTATE %, 실제 % — %)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL  %  (기대 SQLSTATE % 인데 성공했다)', p_label, p_state;
end;
$fn$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com')
on conflict (id) do nothing;

do $t$ begin raise notice '[프로젝트] data09-09 — 소유자 격리 · anon 차단 · 기록성 · 제약 · 함수 권한'; end $t$;

-- ----------------------------------------------------------------------------
-- 1. 사용자 A 가 각 표에 한 행씩 넣는다 (owner_id 는 기본값으로 채워져야 한다)
-- ----------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $t$
begin
  insert into public.workspace (settings, param_values, ref_version_id)
  values ('{"user":"A"}', '{"UP_1_start":300}', 'V001');
  insert into public.calibration_version (version_id, name, author, param_values, confirmed)
  values ('V001', '예시 초기값', 'A', '{"UP_1_start":300}', true);
  insert into public.change_log (user_name, key, from_value, to_value, source, reason)
  values ('A', 'UP_1_start', '300', '280', '직접 입력', '테스트');
  insert into public.sensory_label (label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
  values ('L0001', 'UP', 1, 'Start', 'OK', 'OK', 'Good', 'Accept');
  insert into public.acceptance_criteria (param_key, stab_min, stab_max, shock_max, resp_max)
  values ('UP_1_start', -0.5, 0.5, 1.2, 0.8);
  insert into public.mapping_profile (profile_id, name, version, mode)
  values ('MP-001', '시험장비 A', 1, 'split');

  perform public._assert_eq((select owner_id from public.workspace),
    '11111111-1111-1111-1111-111111111111'::uuid, 'owner_id 기본값이 auth.uid() 로 채워진다');
  perform public._assert_eq((select count(*) from public.change_log), 1::bigint, 'A 는 자기 변경 이력을 본다');
  perform public._assert_eq((select count(*) from public.sensory_label), 1::bigint, 'A 는 자기 라벨을 본다');
end $t$;
commit;

-- updated_at 트리거 — 다른 트랜잭션에서 고치면 created_at 보다 뒤가 된다
begin;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $t$
begin
  update public.sensory_label set memo = '수정' where label_id = 'L0001';
  perform public._assert((select updated_at > created_at from public.sensory_label where label_id = 'L0001'),
    'updated_at 트리거가 수정 시각을 갱신한다');
end $t$;
commit;

-- ----------------------------------------------------------------------------
-- 2. 사용자 B — A 의 행을 보지도, 고치지도, 지우지도, 대신 쓰지도 못한다
-- ----------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
do $t$
declare n bigint;
begin
  perform public._assert_eq(
    (select count(*) from public.workspace) + (select count(*) from public.calibration_version)
    + (select count(*) from public.change_log) + (select count(*) from public.sensory_label)
    + (select count(*) from public.acceptance_criteria) + (select count(*) from public.mapping_profile),
    0::bigint, 'B 에게는 A 의 행이 6개 표 어디에서도 보이지 않는다');

  update public.sensory_label set memo = 'B가 고침' where label_id = 'L0001';
  get diagnostics n = row_count;
  perform public._assert_eq(n, 0::bigint, 'B 의 UPDATE 는 A 의 라벨에 닿지 않는다');

  delete from public.acceptance_criteria where param_key = 'UP_1_start';
  get diagnostics n = row_count;
  perform public._assert_eq(n, 0::bigint, 'B 의 DELETE 는 A 의 허용 범위에 닿지 않는다');

  perform public._assert_raises(
    $s$insert into public.sensory_label (owner_id, label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
       values ('11111111-1111-1111-1111-111111111111', 'L9999', 'UP', 1, 'Start', 'OK', 'OK', 'Good', 'Accept')$s$,
    '42501', 'B 는 owner_id 를 A 로 적어 대신 쓸 수 없다');

  -- UNIQUE 는 사용자별이다 — B 도 같은 label_id·version_id 를 쓸 수 있다
  insert into public.sensory_label (label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
  values ('L0001', 'DOWN', 2, 'Stop', 'NG', 'OK', 'Too Slow', 'Reject');
  insert into public.calibration_version (version_id, name, param_values) values ('V001', 'B 초기값', '{}');
  perform public._assert_eq((select count(*) from public.sensory_label), 1::bigint,
    '같은 label_id 라도 사용자가 다르면 따로 저장된다');

  -- 자기 행을 A 에게 넘기는 UPDATE 는 WITH CHECK 가 막는다. WHERE 없이 쓴다 — WHERE 가 있으면
  -- SELECT 정책이 새 행에도 걸려 WITH CHECK 가 빠져도 막히므로 검사가 헛돈다.
  -- 다른 제약에 먼저 걸리지 않도록 A 와 겹치지 않는 행으로 잰다.
  insert into public.acceptance_criteria (param_key) values ('DOWN_4_stop');
  perform public._assert_raises(
    $s$update public.acceptance_criteria set owner_id = '11111111-1111-1111-1111-111111111111'$s$,
    '42501', 'B 는 자기 행의 owner_id 를 A 로 넘길 수 없다 (with check)');
end $t$;
commit;

-- A 의 행이 그대로인가 (관리자 권한으로 확인)
do $t$
begin
  perform public._assert_eq((select memo from public.sensory_label
      where owner_id = '11111111-1111-1111-1111-111111111111' and label_id = 'L0001'),
    '수정', 'B 의 시도 뒤에도 A 의 라벨은 그대로다');
  perform public._assert_eq((select count(*) from public.acceptance_criteria
      where owner_id = '11111111-1111-1111-1111-111111111111'), 1::bigint,
    'B 의 시도 뒤에도 A 의 허용 범위는 그대로다');
end $t$;

-- ----------------------------------------------------------------------------
-- 3. 비로그인(anon) — 읽기도 쓰기도 막힌다
-- ----------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '';
set local role anon;
do $t$
declare t text;
begin
  foreach t in array array['workspace','calibration_version','change_log','sensory_label','acceptance_criteria','mapping_profile']
  loop
    perform public._assert_raises(format('select * from public.%I', t), '42501', 'anon 은 ' || t || ' 를 읽을 수 없다');
  end loop;
  perform public._assert_raises(
    $s$insert into public.change_log (key) values ('UP_1_start')$s$, '42501', 'anon 은 변경 이력을 쓸 수 없다');
  perform public._assert_raises(
    $s$insert into public.workspace (settings) values ('{}')$s$, '42501', 'anon 은 작업 공간을 만들 수 없다');
end $t$;
commit;

-- ----------------------------------------------------------------------------
-- 4. 기록성 표 — 본인 것이라도 고치거나 지울 수 없다
-- ----------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $t$
begin
  perform public._assert_raises($s$update public.change_log set to_value = '999'$s$, '42501',
    'change_log 는 본인도 UPDATE 할 수 없다');
  perform public._assert_raises($s$delete from public.change_log$s$, '42501',
    'change_log 는 본인도 DELETE 할 수 없다');
  perform public._assert_raises($s$update public.calibration_version set confirmed = false$s$, '42501',
    '확정된 Calibration 버전은 본인도 UPDATE 할 수 없다');
  perform public._assert_raises($s$delete from public.calibration_version$s$, '42501',
    'Calibration 버전은 본인도 DELETE 할 수 없다');
end $t$;
commit;

do $t$
declare v_bad text;
begin
  select string_agg(c.relname || ':' || p.polcmd::text, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname in ('change_log', 'calibration_version') and p.polcmd in ('w', 'd', '*');
  perform public._assert(v_bad is null,
    '기록성 표에 UPDATE/DELETE/ALL 정책이 없다' || coalesce(' (발견: ' || v_bad || ')', ''));
end $t$;

-- 정책이 전부 owner_id = auth.uid() 에 묶여 있는가 (조건이 빠진 정책을 잡는다)
do $t$
declare v_bad text;
begin
  select string_agg(p.polname, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
         not like '%owner_id = auth.uid()%';
  perform public._assert(v_bad is null,
    '모든 정책이 owner_id = auth.uid() 로 묶여 있다' || coalesce(' (발견: ' || v_bad || ')', ''));
end $t$;

do $t$
begin
  perform public._assert_eq((select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'),
    20::bigint, '정책 수가 20개다 (4개 표 × 4 + 기록성 2개 표 × 2, 재실행해도 늘지 않는다)');
end $t$;

-- ----------------------------------------------------------------------------
-- 5. CHECK · UNIQUE
-- ----------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
do $t$
begin
  perform public._assert_raises($s$insert into public.sensory_label (label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
     values ('X1', 'UP', 5, 'Start', 'OK', 'OK', 'Good', 'Accept')$s$, '23514', 'Zone 은 1~4 만 받는다');
  perform public._assert_raises($s$insert into public.sensory_label (label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
     values ('X2', 'LEFT', 1, 'Start', 'OK', 'OK', 'Good', 'Accept')$s$, '23514', '방향은 UP/DOWN 만 받는다');
  perform public._assert_raises($s$insert into public.sensory_label (label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
     values ('X3', 'UP', 1, 'Start', 'OK', 'OK', 'Good', 'Maybe')$s$, '23514', 'overall 은 Accept/Borderline/Reject 만 받는다');
  perform public._assert_raises($s$insert into public.sensory_label (label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
     values ('X4', 'UP', 1, 'Start', 'OK', 'OK', 'Fast', 'Accept')$s$, '23514', '응답성 라벨은 정해진 세 값만 받는다');
  perform public._assert_raises($s$insert into public.sensory_label (label_id, direction, zone, event, shock_label, pitch_label, resp_label, overall)
     values ('L0001', 'UP', 1, 'Start', 'OK', 'OK', 'Good', 'Accept')$s$, '23505', '같은 사용자의 label_id 중복은 UNIQUE 가 막는다');
  perform public._assert_raises($s$insert into public.acceptance_criteria (param_key) values ('UP_5_start')$s$,
    '23514', '파라미터 키는 (UP|DOWN)_1~4_(start|stop) 형식만 받는다');
  perform public._assert_raises($s$insert into public.acceptance_criteria (param_key, stab_min, stab_max) values ('UP_2_stop', 1, -1)$s$,
    '23514', '안정도 하한이 상한보다 크면 막는다');
  perform public._assert_raises($s$insert into public.acceptance_criteria (param_key) values ('UP_1_start')$s$,
    '23505', '같은 파라미터의 허용 범위 중복은 UNIQUE 가 막는다');
  perform public._assert_raises($s$insert into public.calibration_version (version_id, name, param_values) values ('V001', '중복', '{}')$s$,
    '23505', '같은 사용자의 버전 번호 중복은 UNIQUE 가 막는다');
  perform public._assert_raises($s$insert into public.calibration_version (version_id, name, param_values) values ('v2', '형식', '{}')$s$,
    '23514', '버전 번호는 V001 형식만 받는다');
  perform public._assert_raises($s$insert into public.change_log (key) values ('ARM_1_start')$s$,
    '23514', '변경 이력의 key 는 파라미터 키 또는 (버전) 만 받는다');
  perform public._assert_raises($s$insert into public.mapping_profile (profile_id, name, version, mode) values ('MP-001', '시험장비 A', 1, 'split')$s$,
    '23505', '같은 Profile·버전 중복은 UNIQUE 가 막는다');
  perform public._assert_raises($s$insert into public.mapping_profile (profile_id, name, version, mode) values ('MP-002', 'x', 0, 'split')$s$,
    '23514', 'Profile 버전은 1 이상이다');
  perform public._assert_raises($s$insert into public.mapping_profile (profile_id, name, version, mode) values ('MP-003', 'x', 1, 'dual')$s$,
    '23514', 'Current 모드는 split/single 만 받는다');
  perform public._assert_raises($s$insert into public.workspace (settings) values ('{}')$s$,
    '23505', '작업 공간은 사용자당 한 행이다');
end $t$;
commit;

-- ----------------------------------------------------------------------------
-- 6. 함수 권한 · search_path · 표 권한
-- ----------------------------------------------------------------------------
do $t$
declare v_bad text;
begin
  -- proacl 이 NULL 이면 "기본값 = PUBLIC 에 EXECUTE" 라는 뜻이다. NULL 도 실패로 본다.
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname not like '\_assert%'
     and (p.proacl is null
          or exists (select 1 from aclexplode(p.proacl) a
                      where a.privilege_type = 'EXECUTE'
                        and (a.grantee = 0 or a.grantee = 'anon'::regrole::oid)));
  perform public._assert(v_bad is null,
    'proacl 에 PUBLIC·anon EXECUTE 가 없다 (예외로 둔 함수도 없음)' || coalesce(' (발견: ' || v_bad || ')', ''));

  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname not like '\_assert%'
     and not coalesce('search_path=public' = any(p.proconfig), false);
  perform public._assert(v_bad is null,
    '모든 함수에 search_path = public 이 고정돼 있다' || coalesce(' (발견: ' || v_bad || ')', ''));

  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'));
  perform public._assert(v_bad is null,
    'anon 에 표 권한이 남지 않았다 (Supabase 자동 부여를 끊었다)' || coalesce(' (발견: ' || v_bad || ')', ''));
end $t$;

-- 정리
delete from public.change_log;
delete from public.calibration_version;
delete from public.sensory_label;
delete from public.acceptance_criteria;
delete from public.mapping_profile;
delete from public.workspace;
delete from auth.users where email in ('a@example.com', 'b@example.com');

do $t$ begin raise notice ''; raise notice '전부 통과했습니다.'; end $t$;
