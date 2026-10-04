import { describe, expect, it } from 'vitest';
import { nextPhases, parseTargetDate, validateTransition } from '@/lib/problem';
import { can, assertCan, PermissionError } from '@/lib/permissions';

describe('problem transitions', () => {
  it('เดินตามลำดับระยะเท่านั้น', () => {
    expect(nextPhases('IDENTIFICATION')).toEqual(['CONTROL']);
    expect(validateTransition('IDENTIFICATION', 'KNOWN_ERROR', { openChanges: 0 })).toMatch(/ไม่สามารถ/);
    expect(validateTransition('IDENTIFICATION', 'CONTROL', { openChanges: 0 })).toBeNull();
  });
  it('เข้าควบคุมข้อผิดพลาดต้องมี root cause', () => {
    expect(validateTransition('CONTROL', 'ERROR_CONTROL', { openChanges: 0 })).toMatch(/Root cause/);
    expect(validateTransition('CONTROL', 'ERROR_CONTROL', { rootCause: ' ', openChanges: 0 })).toMatch(/Root cause/);
    expect(validateTransition('CONTROL', 'ERROR_CONTROL', { rootCause: 'pool เต็ม', openChanges: 0 })).toBeNull();
  });
  it('Known Error ต้องมี workaround', () => {
    expect(validateTransition('ERROR_CONTROL', 'KNOWN_ERROR', { rootCause: 'x', openChanges: 0 })).toMatch(/Workaround/);
    expect(validateTransition('ERROR_CONTROL', 'KNOWN_ERROR', { workaround: 'รีสตาร์ท', openChanges: 0 })).toBeNull();
  });
  it('ปิด Problem ต้องมี root cause และไม่มี Change ค้าง', () => {
    expect(validateTransition('KNOWN_ERROR', 'RESOLVED', { rootCause: 'x', openChanges: 1 })).toMatch(/Change/);
    expect(validateTransition('KNOWN_ERROR', 'RESOLVED', { openChanges: 0 })).toMatch(/สาเหตุ/);
    expect(validateTransition('KNOWN_ERROR', 'RESOLVED', { rootCause: 'x', openChanges: 0 })).toBeNull();
  });
  it('เปิดใหม่จาก RESOLVED ได้', () => {
    expect(validateTransition('RESOLVED', 'CONTROL', { openChanges: 0 })).toBeNull();
  });
});

describe('permissions', () => {
  it('Incident: เจ้าหน้าที่ทุกบทบาททำได้ แต่ผู้ใช้ปลายทางไม่ได้', () => {
    for (const r of ['AGENT', 'RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'CAB_MEMBER', 'CONFIG_MANAGER', 'ADMIN'] as const) expect(can(r, 'incident.manage')).toBe(true);
    expect(can('END_USER', 'incident.manage')).toBe(false);
  });
  it('CMDB: แก้ไขได้เฉพาะ Agent/หัวหน้ากลุ่ม/Config Manager/Admin', () => {
    expect(can('CONFIG_MANAGER', 'cmdb.manage')).toBe(true);
    expect(can('CAB_MEMBER', 'cmdb.manage')).toBe(false);
    expect(can('CHANGE_MANAGER', 'cmdb.manage')).toBe(false);
    expect(can('END_USER', 'cmdb.manage')).toBe(false);
  });
  it('เฉพาะ CAB/Change Manager/Admin อนุมัติ Change ได้', () => {
    expect(can('CAB_MEMBER', 'change.approve')).toBe(true);
    expect(can('AGENT', 'change.approve')).toBe(false);
    expect(can('END_USER', 'problem.manage')).toBe(false);
    expect(can(null, 'kb.manage')).toBe(false);
  });
  it('assertCan โยน PermissionError', () => {
    expect(() => assertCan('AGENT', 'kb.publish')).toThrow(PermissionError);
    expect(() => assertCan('ADMIN', 'kb.publish')).not.toThrow();
  });
});

describe('parseTargetDate', () => {
  it('ว่าง = ล้างค่า; วันที่ถูกต้อง = 00:00 เวลาไทย', () => {
    expect(parseTargetDate('')).toEqual({ date: null });
    expect(parseTargetDate('  ')).toEqual({ date: null });
    expect(parseTargetDate('2026-10-05')).toEqual({ date: new Date('2026-10-04T17:00:00Z') });
  });
  it('ปฏิเสธรูปแบบผิดและวันที่ที่ไม่มีจริง', () => {
    for (const bad of ['5/10/2026', '2026-1-5', '2026-02-30', '2026-13-01', 'abc', '2026-10-05T00:00']) expect(parseTargetDate(bad)).toHaveProperty('error');
  });
});
