import { ScanLine, Settings, Trophy, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import { useAppState } from './lib/store';
import { navigate, useRoute, type Route } from './lib/hooks';
import { clockTime } from './lib/time';
import { ConfirmHost, ToastHost } from './components/ui';
import { ScannerPage } from './pages/ScannerPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { QrPrintPage } from './pages/QrPrintPage';
import { ResultsPage } from './pages/ResultsPage';
import { SettingsPage } from './pages/SettingsPage';

const NAV: { route: Route; label: string; icon: ComponentType }[] = [
  { route: 'ziel', label: 'Ziel', icon: ScanLine },
  { route: 'teilnehmer', label: 'Teilnehmer', icon: Users },
  { route: 'ergebnisse', label: 'Ergebnisse', icon: Trophy },
  { route: 'einstellungen', label: 'Einstellungen', icon: Settings },
];

export function App() {
  const route = useRoute();
  const s = useAppState();
  const start = s.settings.startTime;
  const dark = route === 'ziel';
  const active = route === 'qr' ? 'teilnehmer' : route;

  const navButtons = NAV.map(({ route: r, label, icon: Icon }) => (
    <button key={r} className="navbtn" aria-current={active === r ? 'page' : undefined} onClick={() => navigate(r)}>
      <Icon />
      {label}
    </button>
  ));

  return (
    <div className="app" data-theme={dark ? 'dark' : 'light'}>
      <header className="topbar">
        <div className="brand">
          <img src="./favicon.svg" alt="" />
          <div className="brand-text">
            <div className="brand-title">{s.settings.eventName || 'Benefizlauf'}</div>
            <div className="brand-sub">Zeitnahme</div>
          </div>
        </div>
        <nav className="topnav" aria-label="Hauptnavigation">
          {navButtons}
        </nav>
        <button
          className={`pill ${start ? 'pill-ok' : 'pill-warn'}`}
          onClick={() => navigate('einstellungen')}
          title="Startzeit"
        >
          <span className="dot" />
          {start ? `Start ${clockTime(start)}` : 'Startzeit fehlt'}
        </button>
      </header>

      <main>
        {route === 'ziel' && <ScannerPage />}
        {route === 'teilnehmer' && <ParticipantsPage />}
        {route === 'qr' && <QrPrintPage />}
        {route === 'ergebnisse' && <ResultsPage />}
        {route === 'einstellungen' && <SettingsPage />}
      </main>

      <nav className="bottomnav" aria-label="Hauptnavigation">
        {navButtons}
      </nav>
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
