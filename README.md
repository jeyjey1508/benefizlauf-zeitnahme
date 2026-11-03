# Benefizlauf Zeitnahme

Zeitnahme-App für den Schul-Benefizlauf (Massenstart, Bruttozeiten). Läuft komplett im Browser, auch ohne Internet,
und lässt sich auf Android und iPhone wie eine normale App installieren. Kein Server, kein Login: Alle Daten bleiben auf
dem jeweiligen Gerät.

## Ablauf am Lauftag

1. **Teilnehmer** → CSV importieren (Spalten: `startnummer;vorname;nachname;strecke;disziplin;team`,
   Strecke `3.0`/`5.7`, Disziplin `Lauf`/`Walk`). Eine Beispiel-CSV gibt es in der App.
2. **Teilnehmer → QR-Codes drucken** → Startnummern-Karten (A4, 10 pro Seite).
3. **Einstellungen → Startzeit = jetzt** beim Startschuss drücken.
   Weitere Scanner-Geräte: „An anderes Gerät“ → QR-Code am anderen Gerät im Ziel-Scanner scannen.
4. **Ziel** → Kamera-Scan starten oder Nummer eintippen + Enter.
5. **Ergebnisse** → CSV exportieren / drucken.

### Mehrere Scanner-Geräte

Jedes Gerät speichert seine Zielzeiten selbst. Am Ende auf jedem Gerät **Einstellungen → Backup speichern**, die Dateien
auf ein Hauptgerät bringen und dort **Backup einlesen → Zusammenführen**. Bei doppelt erfassten Nummern zählt die
früheste Zeit.

### Wichtig

- Die installierte App (Home-Bildschirm) hat einen **eigenen Speicher**, getrennt vom Browser. Daten also direkt in der
  installierten App importieren.
- Vor dem Lauf und nach dem Lauf ein **JSON-Backup** speichern.
- Die Kamera funktioniert nur über `https://` (oder `localhost`).

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver (im WLAN erreichbar, Kamera dort aber nur über https)
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal testen (inkl. Offline-Modus)
```

## Veröffentlichen (GitHub Pages)

1. Repository auf GitHub anlegen und den Code nach `main` pushen.
2. Im Repository: **Settings → Pages → Source: GitHub Actions**.
3. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht die App automatisch.
   Adresse: `https://<benutzername>.github.io/<repository>/`
