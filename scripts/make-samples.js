// 예시 파일 생성: node scripts/make-samples.js
// 모두 합성(가상) 데이터입니다. 열 이름만 제출 기획서 4.3 의 sample data.csv 헤더를 따릅니다.
const fs = require('fs'), path = require('path');
const L = require('../js/logic.js');
const Smp = require('../js/sample-data.js');
const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
const write = (name, text) => { fs.writeFileSync(path.join(out, name), '﻿' + text); console.log('  ' + name); };
const s = L.defaultSettings();
const v1 = Smp.sampleSet(), v2 = { ...v1, UP_3_stop: 120, UP_4_stop: 120, DOWN_1_start: 140 };
const log1 = Smp.sampleLog(v1, 11), log2 = Smp.sampleLog(v2, 23);
write('예시데이터_시험로그1_V001.csv', L.toCsv(log1[0], log1.slice(1)));
write('예시데이터_시험로그2_V002.csv', L.toCsv(log2[0], log2.slice(1)));
write('예시데이터_CalibrationSet_V001.csv', L.toCsv(L.SET_HEADER, L.setToRows(v1, s)));
const labels = Smp.sampleLabels(s);
write('예시데이터_라벨DB.csv', L.toCsv(L.LABEL_FIELDS, labels.map(l => L.LABEL_FIELDS.map(k => l[k]))));
// 다시 읽어 원본과 같은지 확인
const back = L.tableFromRows(L.parseCsv(fs.readFileSync(path.join(out, '예시데이터_시험로그1_V001.csv'), 'utf8')));
if (back.data.length !== log1.length - 1 || back.header.join() !== log1[0].join()) throw new Error('로그 왕복 불일치');
const lb = L.labelsFromTable(...(t => [t.header, t.data])(L.tableFromRows(L.parseCsv(fs.readFileSync(path.join(out, '예시데이터_라벨DB.csv'), 'utf8')))));
if (lb.labels.length !== labels.length || lb.problems.length) throw new Error('라벨 왕복 불일치');
const sb = L.tableFromRows(L.parseCsv(fs.readFileSync(path.join(out, '예시데이터_CalibrationSet_V001.csv'), 'utf8')));
const sv = L.setFromTable(sb.header, sb.data).values;
if (L.PARAM_KEYS.some(k => sv[k] !== v1[k])) throw new Error('Set 왕복 불일치');
console.log('왕복 확인 OK — 로그 ' + back.data.length + '행, 라벨 ' + labels.length + '건');
