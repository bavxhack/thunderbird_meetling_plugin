# Manuelle Thunderbird-Abnahme

Status: offen. Keine Live-Anmeldung oder native Thunderbird-Ausführung in der Entwicklungsumgebung durchgeführt. Mit einem Testkonto und Testkalender prüfen; Testkonferenzen anschließend im Server verwalten.

- [ ] XPI unter der vorgesehenen Thunderbird-Version installieren. Hauptfenster, Verfassen-Button und Kalenderbutton prüfen; Tastatur, Kontrastmodus und Skalierung testen.
- [ ] Ohne Kalender verständlicher Fehler vor Create. Mit beschreibbarem Kalender nativer neuer Entwurf; leerer Betreff bleibt leer.
- [ ] Installation mit Unterpfad konfigurieren; API-/Loginrouten im Serverprotokoll bestätigen, ohne Tokens zu protokollieren.
- [ ] Normalen Login, SSO-Weiterleitung, OTP/MFA und SSO-Popup testen. Popup muss den Login-Container und opener behalten. Systembrowser-/andere Thunderbird-Cookies dürfen nicht verwendet oder gelöscht werden.
- [ ] „Zurück zu Meetling“ vor/nach MFA, Abbruch, Fensterschließen und fünf Minuten Timeout prüfen. Login-Abbruch darf keine verspätete Anmeldung speichern. Downloadantwort darf keine Tokendatei erzeugen.
- [ ] Neustart mit gespeichertem Token: kein Loginfenster; Serverliste funktioniert ohne Websitzung. Mit Hauptpasswort geschützten sowie gesperrten/abgebrochenen NSS-Zugriff prüfen.
- [ ] Kein Server: keine Erstellung. Ein Server: direkt. Mehrere Server: große Buttons, gleiche Namen unterscheidbar, lange Namen scrollbar/Tooltip, Auswahl per Tastatur. Abbrechen: kein POST.
- [ ] Bestehenden Kalenderentwurf mit Teilnehmern, Zeiten, Formatierung und Betreff ergänzen. Beide Links anklickbar, Ort „Meetling Konferenz“, Einwahlnummern mit Land und PIN mit führenden Nullen. Mailentwürfe in HTML und Klartext prüfen.
- [ ] Kalenderbearbeitung sowohl im Tab als auch im separaten Fenster prüfen. Empfangene Einladungen und schreibgeschützte Kalender müssen vor dem Request abgewiesen werden.
- [ ] HTTP-/HTTPS-Teilnahmelinks, riesige Konferenz-ID, fehlende ID und optionale/fehlende Telefonfelder prüfen. Bei fehlender ID bleibt der erzeugte Raum nutzbar.
- [ ] Doppelklick und erneute Erstellung im selben Entwurf: höchstens ein Create-Request. Pending-Marker nach Netzwerkfehler sowie nach Speichern/Wiederöffnen eines Entwurfs prüfen.
- [ ] Editor während Create schließen/wechseln/speichern: vorhandenen Raum manuell übernehmen, kein zweiter Request und keine Einfügung in anderen Entwurf. Kopieren der Links prüfen.
- [ ] TLS-/Proxy-/DNS-/Timeoutfehler: kein Retry, Token bei Transportfehler erhalten. Ungültiges Token: erneute Anmeldung erforderlich.
- [ ] Logout `token:null`, „No user loged found“, fehlerhafte Logoutantwort und Netzwerkfehler prüfen. Nur bewusstes lokales Abmelden entfernt bei Fehlern die Anmeldung.
- [ ] Managed Storage gültig/ungültig/unlesbar; kein Benutzerfallback. Reload und Installationswechsel: Cache/Anmeldestatus verwerfen, keine alten Antworten übernehmen.
- [ ] Mit gespeichertem Token nach Neustart serverseitig die korrekte Moderatoridentität und Rechte des Bearbeitungslinks prüfen.
- [ ] Deaktivieren/Deinstallieren: native Buttons und Fensterlistener entfernt, keine gespeicherten Termine verändert. Erneute Installation prüfen.

Ergebnis mit Thunderbird-Version, OS, Serverversion und SSO-Anbieter dokumentieren. Eine erfolgreiche simulierte JSON-Antwort bestätigt weder SSO-Kompatibilität noch serverseitige Moderatorzuordnung.
