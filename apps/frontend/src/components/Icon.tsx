import type { IconName } from '../types/app';

type IconProps = {
  name: IconName;
};

export function Icon({ name }: IconProps) {
  const paths: Record<IconName, string> = {
    home: 'M3 11.5L12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    payments: 'M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm0 3h18M7 15h3',
    megaphone: 'M3 10v4h4l6 4V6l-6 4zm10-2h3m0 0l4-2m-4 2l4 2',
    vote: 'M4 5h16v14H4zM8 9h8M8 13h5M16 16l2 2 3-3',
    tools: 'M21 3l-6 6m-2 2l-8 8m7-12l3 3m-5 5l3 3M8 4a4 4 0 0 0 4 4',
    report: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h8',
    approve: 'M4 12l5 5L20 6M3 4h18M3 20h18',
    money: 'M12 2v20M6 7c0-2 2-3 6-3s6 1 6 3-2 3-6 3-6 1-6 3 2 3 6 3 6-1 6-3',
    users: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM6 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM2 20a4 4 0 0 1 8 0m2 0a5 5 0 0 1 10 0',
    menu: 'M3 6h18M3 12h18M3 18h18',
    close: 'M5 5l14 14M19 5L5 19',
    download: 'M12 3v11m0 0l-4-4m4 4l4-4M5 20h14',
    check: 'M4 12l5 5L20 6',
  };

  return (
    <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
