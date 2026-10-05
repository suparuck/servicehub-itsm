import { describe, expect, it } from 'vitest';
import { safeInternalPath } from '@/lib/notificationService';

describe('safeInternalPath (กัน open redirect ในเส้นทางเปิดการแจ้งเตือน)', () => {
  it('รับพาธภายในปกติ', () => {
    for (const ok of ['/incidents/INC-00001', '/portal/my/INC-24818', '/changes/CHG-3376?x=1', '/']) expect(safeInternalPath(ok), ok).toBe(true);
  });
  it('ปฏิเสธ URL ภายนอก protocol-relative แบ็กสแลช และอักขระควบคุม', () => {
    for (const bad of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'incidents/1', '', '/a\r\nSet-Cookie: x=1', '/a\u0000b']) expect(safeInternalPath(bad), JSON.stringify(bad)).toBe(false);
  });
});
