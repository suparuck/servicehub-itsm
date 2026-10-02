import { describe, expect, it } from 'vitest';
import { nextPhases, validateTransition } from '@/lib/problem';
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
