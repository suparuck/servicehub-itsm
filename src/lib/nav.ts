import { th } from '@/i18n/th';

export type NavItem = { id: string; label: string; href: string };
export type NavGroup = { group: string; items: NavItem[]; adminOnly?: boolean };

// จัดกลุ่มตาม Service Value Chain (ตามลำดับใน design/Main.dc.html)
export const NAV: NavGroup[] = [
  { group: th.nav.overview, items: [{ id: 'dashboard', label: th.nav.dashboard, href: '/' }] },
  {
    group: th.nav.engage,
    items: [
      { id: 'serviceDesk', label: th.nav.serviceDesk, href: '/service-desk' },
      { id: 'portal', label: th.nav.portal, href: '/portal' },
    ],
  },
  {
    group: th.nav.deliver,
    items: [
      { id: 'incident', label: th.nav.incident, href: '/incidents' },
      { id: 'request', label: th.nav.request, href: '/requests' },
      { id: 'problem', label: th.nav.problem, href: '/problems' },
      { id: 'monitoring', label: th.nav.monitoring, href: '/monitoring' },
    ],
  },
  {
    group: th.nav.design,
    items: [
      { id: 'change', label: th.nav.change, href: '/changes' },
      { id: 'calendar', label: th.nav.calendar, href: '/calendar' },
      { id: 'release', label: th.nav.release, href: '/releases' },
      { id: 'catalogue', label: th.nav.catalogue, href: '/catalogue' },
    ],
  },
  {
    group: th.nav.obtain,
    items: [
      { id: 'cmdb', label: th.nav.cmdb, href: '/cmdb' },
      { id: 'itam', label: th.nav.itam, href: '/assets' },
    ],
  },
  {
    group: th.nav.plan,
    items: [
      { id: 'sla', label: th.nav.sla, href: '/sla' },
      { id: 'knowledge', label: th.nav.knowledge, href: '/knowledge' },
      { id: 'improvement', label: th.nav.improvement, href: '/improvement' },
    ],
  },
];

/** กลุ่มเมนูที่แสดงเฉพาะผู้ดูแลระบบ (ไม่เกี่ยวกับ Service Value Chain) */
NAV.push({ group: 'ADMIN · ผู้ดูแลระบบ', adminOnly: true, items: [{ id: 'users', label: 'ผู้ใช้และสิทธิ์', href: '/admin/users' }, { id: 'email', label: 'อีเมลและการแจ้งเตือน', href: '/admin/email' }] });

export const flatNav = NAV.flatMap((g) => g.items);
