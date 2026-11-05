# Administrierte Konfiguration

Die Erweiterungs-ID lautet `meetling-thunderbird@bavxhack.de`. Thunderbird WebExtension Managed Storage kann organisationsweit diese Konfiguration bereitstellen:

```json
{
  "configuration": {
    "baseUrl": "https://meetling.example.org/installation/",
    "apiBasePath": "api/v1/outlook/plugin/",
    "loginBasePath": "room/outlook/plugin/",
    "timeoutSeconds": 30,
    "endpoints": {
      "login": "outlooklogin",
      "servers": "server",
      "createConference": "createConference",
      "logout": "logout"
    }
  }
}
```

`configuration` ist der Managed-Storage-Schlüssel, nicht der Name einer Datei im Add-on. Betriebssystemabhängige Bereitstellung über Thunderbirds Managed-Storage-Manifest oder Unternehmensrichtlinie durchführen; Schema: `extension/managed-schema.json`. Benutzer dürfen die Vorgabe nicht ersetzen. Ohne Organisationsvorgabe speichert die Einstellungsseite dieselbe Struktur im lokalen Erweiterungsspeicher.

Eine vorhandene ungültige Organisationsvorgabe sperrt die Konferenzfunktionen und Benutzeränderungen. Nach Änderung „Konfiguration neu laden“ wählen und erneut anmelden. Konfigurationswechsel widerruft das Token beim früheren Server nicht.

Tokens und Anzeigenamen werden zusammen mit der Installationsadresse verschlüsselt; der Speicherschlüssel enthält deren SHA-256-Hash. NSS nutzt das Thunderbird-Profil und gegebenenfalls das Hauptpasswort. Dies ist die Thunderbird-Entsprechung zur Outlook-DPAPI-Speicherung und keine Übernahme von Windows-Token-Dateien. Kein Klartextfallback. Zugriff auf Profil/Backup gemäß Organisationsrichtlinien schützen.

Serverseitige Abmeldung kann alle Clients treffen, die denselben Tokenwert nutzen. Bei Netzwerkfehler bleibt das Token für einen weiteren Widerrufsversuch erhalten. „Nur lokal abmelden“ entfernt es ausschließlich aus diesem Erweiterungsspeicher; SSO-Websitzungen und andere Clients werden nicht abgemeldet.
