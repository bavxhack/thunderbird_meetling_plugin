# Architektur und Übertragung

Die Implementierung liest keine Outlook-Dateien zur Laufzeit. Alle Quelldateien liegen in diesem Thunderbird-Repository. Die Outlook-Referenz wurde ausschließlich gelesen.

| Outlook-Funktion | Thunderbird-Umsetzung |
| --- | --- |
| COM/Ribbon | `browser_action`, `compose_action`, nativer Button im Kalendereditor |
| WebView2 mit neuem Profil | sichtbares Popup im neuen Thunderbird-Cookie-Container |
| exakte JSON-Netzwerkantwort | `webRequest.filterResponseData`, exakter HTTPS-Endpunkt, eigener Container, Hauptdokument, HTTP 200 |
| SSO-Popups | Thunderbird-Popups im Container der öffnenden Seite; Live-Abnahme erforderlich |
| Zurück zu Meetling | erneute Navigation zum konfigurierten Endpunkt im bestehenden Login-Tab |
| DPAPI CurrentUser | NSS Secret Decoder Ring im Thunderbird-Profil; Hauptpasswort wird respektiert |
| ProgramData-Konfiguration | WebExtension Managed Storage mit `configuration`-Objekt |
| Word-Range-Einfügung | native `nsIHTMLEditor`-Transaktion am Ende des Kalender-/Mail-Editors |
| Pending-Metadaten | `X-MEETLING-CREATION-STATE` / `X-MEETLING-PARTICIPANT-LINK` im nativen Entwurf |
| Linkübernahmedialog | kopierbare Konferenzdaten im Meetling-Fenster |
| rotierendes Windows-Log | begrenzter Diagnosering im Arbeitsspeicher; keine OS-spezifischen Installer-/COM-Diagnosen |

## API-Vertrag

Alle Pfade relativ zur Installationsadresse einschließlich Unterpfad:

| Aktion | Methode | Standardpfad |
| --- | --- | --- |
| Login | Browser GET | `room/outlook/plugin/outlooklogin` |
| Server | GET | `api/v1/outlook/plugin/server` |
| Erstellen | POST | `api/v1/outlook/plugin/createConference` |
| Logout | GET | `api/v1/outlook/plugin/logout` |

API-Requests verwenden `Authorization: Bearer <opaque token>`, `credentials: omit`, Redirect-Sperre, keinen Refresh und keine automatischen Wiederholungen. POST enthält ausschließlich URL-kodiertes `server_id`. Login braucht JSON mit `token` und `name`, Serverliste ein Array mit numerischen Ganzzahl-IDs und Namen, Create ein einzelnes Objekt mit `url`, `title`, optional `id` sowie `phone.numbers.numbers` und `phone.dialIn`. Duplicate-JSON-Schlüssel werden abgewiesen; Ganzzahlen bleiben exakt.

Die alten Standardrouten werden wie in Outlook nur im Arbeitsspeicher migriert. Eigene Pfade werden nicht umgeschrieben. Es werden weder Outlook-Tokens importiert noch Backendänderungen vorausgesetzt. „Gleicher Login“ bedeutet denselben SSO-/MFA-Vertrag, keine Übernahme der Outlook- oder Systembrowser-Sitzung.

## Zustandsgrenzen

Der Zielentwurf wird vor Netzwerkarbeit erfasst. Der Pending-Marker wird unmittelbar vor dem ersten Create-Request gesetzt und bleibt bei Fehlern bestehen. Ein geschlossener oder zwischenzeitlich ersetzter Editor erhält keine Daten; stattdessen bleibt die erhaltene Konferenz zur manuellen Übernahme sichtbar. Ein fehlender Bearbeitungslink löst keine zweite Erstellung aus. Pending-Markierungen sind keine serverseitige Idempotenzgarantie und müssen mit gespeicherten/wieder geöffneten Entwürfen live geprüft werden.

Konfigurationswechsel und Login-Abbruch invalidieren laufende Login-Ergebnisse. Verschlüsselte Speichervorgänge sind serialisiert und prüfen die aktuelle Sitzung vor und nach dem Speichern. Token werden ausschließlich im Hintergrund gehalten; UI-Zustände enthalten kein Token. Managed Storage enthält ausschließlich Konfiguration, keine Secrets.

## Berechtigungen

HTTPS-Hostzugriff ist für beliebige benutzerkonfigurierte Installationen und SSO-Hosts nötig. HTTP-Zugriff dient nur dem Sperren von HTTP-Navigation und der engen, einmaligen Korrektur eines parameterlosen HTTP-Rücksprungs auf denselben HTTPS-Login-Endpunkt. API und Login werden nie über HTTP angefordert. Cookies-/Containerrechte isolieren die Anmeldung und entfernen deren Container. Compose und native Experiment-Rechte dienen der Entwurfsbearbeitung und NSS-Verschlüsselung. Die native API führt selbst keine Netzwerkrequests aus.

Quellen zur Thunderbird-Anbindung: [Fenster-/Containerimplementierung](https://github.com/mozilla/releases-comm-central/blob/master/mail/components/extensions/parent/ext-windows.js), [Kalendereditor](https://github.com/mozilla/releases-comm-central/blob/master/calendar/base/content/item-editing/calendar-item-iframe.js). Quellprüfung ersetzt keine Laufzeitabnahme der unterstützten Thunderbird-Versionen.
