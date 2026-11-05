# Meetling für Thunderbird

Thunderbird-MailExtension mit den Konferenzfunktionen des [Meetling-Outlook-Plugins](https://github.com/bavxhack/outlook_plugin_meetling). Eigenständige JavaScript-Implementierung; das Outlook-Repository wurde nicht geändert. Referenzstand: `003e5a9917124764cee3cc7805c7babb5930ad05` (Version 1.3.7).

## Installieren und verwenden

1. Das fertige [XPI direkt herunterladen](https://github.com/bavxhack/thunderbird_meetling_plugin/raw/refs/heads/main/packages/Meetling-Thunderbird-1.0.0.xpi). Alternativ das Artefakt **Meetling-Thunderbird** aus dem [Build-Workflow](https://github.com/bavxhack/thunderbird_meetling_plugin/actions/workflows/build.yml) herunterladen und entpacken. Alternativ lokal wie unten bauen.
2. In Thunderbird unter **Add-ons und Themes → Zahnrad → Add-on aus Datei installieren** die Datei `Meetling-Thunderbird-1.0.0.xpi` auswählen. Die native Experiment-API benötigt umfassenden Thunderbird-Zugriff; Unternehmensrichtlinien müssen diese Erweiterungen erlauben.
3. In den Add-on-Einstellungen die **HTTPS-Installationsadresse** hinterlegen, z. B. `https://meetling.example.org/` oder einschließlich Installationsunterpfad. Die mitgelieferten API-Pfade unverändert lassen, wenn der Server die Outlook-Plugin-API verwendet.
4. Über den Meetling-Button **Anmelden** wählen. Der sichtbare, isolierte Anmeldebrowser verwendet denselben SSO-/MFA-Weg und denselben `outlooklogin`-Endpunkt wie Outlook. Falls nach MFA nötig: **Zurück zu Meetling** im Meetling-Fenster. Es gibt keine neue OAuth-App, keinen erfundenen Callback und keine Passwort-/Token-Eingabe im Plugin.
5. Im Thunderbird-Hauptfenster über **Meetling → Neues Meetling** einen nativen Kalenderentwurf öffnen. In einem geöffneten Kalenderentwurf steht zusätzlich **Neues Meetling** neben dem Ort. In einem E-Mail-Entwurf den Meetling-Button der Verfassen-Symbolleiste nutzen. Bei mehreren Servern einen großen Serverbutton auswählen; Abbrechen erstellt keinen Raum.
6. Teilnahme- und Moderatorenlink sowie gelieferte Einwahlnummern/PIN werden angehängt. Den Entwurf anschließend selbst prüfen, speichern oder versenden. Betreff, Teilnehmer, Zeiten und vorhandene Formatierung werden nicht ersetzt.

Beim Thunderbird-Start wird eine gespeicherte Anmeldung wiederverwendet. Bei gültiger Konfiguration ohne gespeicherte Anmeldung öffnet sich einmal der Login. Nach Abbruch wird nicht automatisch erneut versucht. Nach Änderung/Neuladen der Konfiguration erneut anmelden.

## Funktionsumfang

- Dieselben Login-, Server-, Create- und Logout-Routen, Bearer-Header und ausschließlich `server_id` als Formularinhalt beim Erstellen.
- Exakte numerische IDs auch oberhalb der JavaScript-Ganzzahlgrenze; Konferenz-ID separat für den Moderatorenlink.
- Servercache für zwei Minuten, explizites Aktualisieren, direkte Verwendung genau eines Servers, bestätigte Auswahl bei mehreren Servern.
- Beide Konferenzlinks als HTML-Hyperlinks, optionale Telefonnummern nach Land und PIN einschließlich führender Nullen; HTTP-Konferenzlinks bleiben wie in Outlook zulässig. Anmeldung/API ausschließlich HTTPS.
- Ausschließlich Entwürfe; keine automatische Speicherung, kein Versand, keine spätere Synchronisation. Empfangene Einladungen und geschützte Editoren werden abgewiesen.
- Globaler Beschäftigtzustand und konservativer Pending-Marker pro Entwurf. Kein automatischer Retry nach unklarem Create-Ausgang. Bei gescheiterter Einfügung werden die bereits erstellten Konferenzdaten kopierbar angezeigt.
- Serverseitiges Abmelden mit Hinweis auf alle Clients desselben Tokens, bestätigtes `token:null`, getrenntes ausdrückliches lokales Abmelden.
- Administrierte Konfiguration vor Benutzerkonfiguration; fehlerhafte Organisationsvorgaben werden nicht durch Benutzereinstellungen umgangen.
- Installationsgebundene, über Thunderbirds NSS Secret Decoder Ring verschlüsselte Tokens und Anzeigenamen. Kein Klartextfallback. Ein eingerichtetes Thunderbird-Hauptpasswort kann beim Entschlüsseln abgefragt werden.
- Eigener frischer Cookie-Container pro Anmeldung, SSO-Popups im selben Kontext, Entfernen der zugehörigen Tabs/Cookies nach Abschluss/Abbruch. Netzwerkantwort des exakten Endpunkts wird abgefangen; kein Token aus DOM, URL oder fremdem Host. Fünf Minuten Timeout, Abbruch und Schutz vor verspäteten Antworten.
- Diagnose mit festen Kategorien, Zeiten und HTTP-Status im Meetling-Fenster. Keine Token, URLs, Mailtexte, Cookies oder Antwortinhalte im Log.

## Bauen und prüfen

Node.js ab Version 20 und Python 3 erforderlich; keine npm-Abhängigkeiten.

```sh
npm test
npm run check
npm run build
```

Ergebnis: `dist/Meetling-Thunderbird-1.0.0.xpi`. Das Paket enthält ausschließlich `extension/`, mit `manifest.json` direkt an der ZIP-Wurzel. GitHub Actions führt dieselben Schritte aus und lädt das XPI samt SHA-256-Prüfsumme als Artefakt hoch.

Die Manifest-Grenzen sind Thunderbird **140 bis 154**. Kalenderintegration, NSS-Speicherung und Toolbarbutton verwenden eine native Experiment-API, da die reguläre MailExtension-API keine vollständige Bearbeitung nativer Kalenderentwürfe anbietet. Beim Wechsel auf eine andere Thunderbird-Hauptversion muss diese Grenze nach Prüfung angepasst werden.

**Prüfstatus:** Automatisierte Vertragstests, Browser-/Controller-Simulationen und Tests der nativen API mit Thunderbird-Doubles sind enthalten. In der Entwicklungsumgebung war keine Thunderbird-Installation verfügbar. Echte Thunderbird-UI, Hauptpasswort, Container, SSO-Popups und die Live-Meetling-Anmeldung sind deshalb noch nicht abgenommen. Die Versionsgrenzen sind Zielkompatibilität, keine bestätigte Testmatrix. Die vollständige [manuelle Abnahme](docs/smoke-test.md) vor produktivem Einsatz durchführen. Insbesondere müssen tatsächlicher SSO und Moderatorzuordnung serverseitig auch nach einem Neustart mit gespeichertem Token funktionieren.

Weitere Details: [Architektur und API](docs/architecture.md), [administrierte Konfiguration](docs/administration.md).
