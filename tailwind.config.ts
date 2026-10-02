import type { Config } from 'tailwindcss';

// Design tokens จาก CLAUDE.md / design/Main.dc.html
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#EEF0EC',
        surface: '#FFFFFF',
        subtle: '#F7F8F5',
        sidebar: '#16191D',
        'sidebar-active': '#2A2F36',
        ink: '#16191D',
        muted: '#5B6170',
        border: '#DADDD6',
        input: '#C9CDC4',
        divider: '#EEF0EC',
        accent: { DEFAULT: '#1F4FD8', hover: '#163A9E', tint: '#E3E9FC', soft: '#DCE4FB', light: '#7FA0F5' },
        ok: { DEFAULT: '#0F766E', fg: '#0B5A54', tint: '#E1F2EF' },
        warn: { DEFAULT: '#C2410C', fg: '#8A3A06', tint: '#FDEFD9', text: '#B54708' },
        critical: { DEFAULT: '#B42318', fg: '#9A1C12', tint: '#FDE8E6', soft: '#FDF3F2', line: '#E8A39B' },
        neutral: { DEFAULT: '#3D434C', tint: '#ECEEEA' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'monospace'],
      },
      borderRadius: { card: '10px', control: '8px', chip: '12px' },
      gridTemplateColumns: {
        shell: '256px minmax(0,1fr)',
        trow: '104px minmax(0,2.4fr) minmax(0,1fr) 108px 120px 132px',
        'trow-s': '96px minmax(0,1fr) 96px',
        ci: '96px minmax(0,1.6fr) minmax(0,1fr) 90px 120px minmax(0,1fr) 92px',
        'ci-s': '90px minmax(0,1fr) 110px',
      },
      screens: { xs: '560px', md: '860px', lg: '1180px' },
    },
  },
  plugins: [],
};
export default config;
