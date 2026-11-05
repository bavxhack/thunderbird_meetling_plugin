/* Native boundary: no network, no mail/calendar persistence, no logging of secrets. */
var { ExtensionCommon } = ChromeUtils.importESModule('resource://gre/modules/ExtensionCommon.sys.mjs');
var { ExtensionSupport } = ChromeUtils.importESModule('resource:///modules/ExtensionSupport.sys.mjs');
var { setTimeout, clearTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
var meetlingNative = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const targets = new Map();
    const injected = new Set();
    const listeners = new Map();
    const SDR = Cc['@mozilla.org/security/sdr;1'].getService(Ci.nsISecretDecoderRing);
    let sequence = 0, notify = null;
    const marker = 'X-MEETLING-CREATION-STATE';
    const participant = 'X-MEETLING-PARTICIPANT-LINK';
    function editorWindow(win) {
      if (!win || win.closed) return null;
      if (win.calendarItem && win.document.getElementById('item-description')) return win;
      const tab = win.document.getElementById('tabmail')?.currentTabInfo;
      const root = tab?.iframe || tab?.browser || (tab?.panel && (typeof tab.panel === 'string' ? win.document.getElementById(tab.panel) : tab.panel));
      const frames = root ? [root, ...root.querySelectorAll('iframe,browser')] : [...win.document.querySelectorAll('iframe')];
      for (const frame of frames) {
        try { const child = frame.contentWindow; if (child?.calendarItem && child.document.getElementById('item-description')) return child; } catch { /* inaccessible content */ }
      }
      return null;
    }
    function writable(w) {
      if (!w || w.closed) throw new Error('Der erfasste Entwurf wurde geschlossen.');
      if (w.gMsgCompose) {
        if (!w.GetCurrentEditor?.() || w.GetCurrentEditor().flags & Ci.nsIEditor.eEditorReadonlyMask) throw new Error('E-Mail-Entwurf ist schreibgeschützt.');
      } else {
        if (!w.calendarItem?.isEvent() || w.gIsReadOnly || w.calendarItem.calendar?.readOnly || w.cal?.itip?.isInvitation(w.calendarItem)) throw new Error('Empfangener oder geschützter Termin kann nicht ergänzt werden.');
        const cal = ChromeUtils.importESModule('resource:///modules/calendar/calUtils.sys.mjs').cal;
        if (cal.itip.isInvitation(w.calendarItem)) throw new Error('Empfangene Besprechungen können nicht ergänzt werden.');
      }
    }
    function state(t) { return t.w.gMsgCompose ? t.w.gMsgCompose.compFields.getHeader(marker) : t.w.calendarItem.getProperty(marker); }
    function put(t, name, value) {
      if (t.w.gMsgCompose) t.w.gMsgCompose.compFields.setHeader(name, value);
      else {
        if (t.w.calendarItem.isMutable === false) t.w.calendarItem=t.w.calendarItem.clone();
        t.w.calendarItem.setProperty(name,value);
      }
    }
    function captureWindow(w) {
      writable(w); const t = {w};
      if (state(t)) throw new Error('Für diesen Entwurf wurde bereits eine Konferenz angefordert. Bei unklarem Ausgang bitte den Server prüfen.');
      const key = String(++sequence); targets.set(key,t); return key;
    }
    function inject(win) {
      const scan = doc => {
        const w = doc.defaultView;
        if (!w?.calendarItem || !doc.getElementById('item-description') || doc.getElementById('meetling-create')) return;
        const location = doc.getElementById('item-location');
        if (!location?.parentNode) return;
        const button = doc.createXULElement('button');
        button.id = 'meetling-create'; button.setAttribute('label','Neues Meetling'); button.setAttribute('tooltiptext','Meetling-Konferenz in diesen Termin einfügen');
        button.addEventListener('command', () => {
          try { notify?.async(captureWindow(w)); }
          catch (e) { Services.prompt.alert(win,'Meetling',e.message); }
        });
        location.parentNode.appendChild(button); injected.add(button);
      };
      const load = e => scan(e.target);
      win.addEventListener('load',load,true); listeners.set(win,load);
      scan(win.document);
      for (const frame of win.document.querySelectorAll('iframe,browser')) { try { if (frame.contentDocument) scan(frame.contentDocument); } catch {} }
    }
    const listenerId = 'meetling-native-' + context.extension.id;
    ExtensionSupport.registerWindowListener(listenerId, {
      chromeURLs:['chrome://messenger/content/messenger.xhtml','chrome://calendar/content/calendar-event-dialog.xhtml'],
      onLoadWindow:inject,
      onUnloadWindow(win) { const l = listeners.get(win); if (l) win.removeEventListener('load',l,true); listeners.delete(win); }
    });
    context.callOnClose({close() {
      ExtensionSupport.unregisterWindowListener(listenerId);
      for (const [win,l] of listeners) if (!win.closed) win.removeEventListener('load',l,true);
      for (const node of injected) node.remove();
      listeners.clear(); injected.clear(); targets.clear(); notify = null;
    }});
    return {meetlingNative:{
      encrypt:async value => SDR.encryptString(value),
      decrypt:async value => SDR.decryptString(value),
      async capture(windowId) {
        const win = context.extension.windowManager.get(windowId,context).window;
        if (win.gMsgCompose) return captureWindow(win);
        const existing = editorWindow(win); if (existing) return captureWindow(existing);
        if (typeof win.createEventWithDialog !== 'function') throw new Error('Bitte ein Thunderbird-Hauptfenster oder einen bearbeitbaren Entwurf öffnen.');
        const cal = ChromeUtils.importESModule('resource:///modules/calendar/calUtils.sys.mjs').cal;
        if (!cal.manager.getCalendars().some(c => cal.acl.isCalendarWritable(c))) throw new Error('Kein beschreibbarer Kalender vorhanden.');
        const previous=new Set();
        for (const candidate of [win,...Services.wm.getEnumerator('Calendar:EventDialog')]) { const old=editorWindow(candidate); if (old) previous.add(old); }
        win.createEventWithDialog();
        // Wait for Thunderbird's native editor. No API request precedes capture.
        for (let n=0; n<100; n++) {
          await new Promise(resolve => setTimeout(resolve,100));
          const candidates = [win, ...Services.wm.getEnumerator('Calendar:EventDialog')];
          for (const candidate of candidates) { const w = editorWindow(candidate); if (w && !previous.has(w) && !w.calendarItem.id && !w.calendarItem.getProperty(marker)) return captureWindow(w); }
        }
        throw new Error('Kalendereditor konnte nicht erfasst werden. Bitte im geöffneten Termin „Neues Meetling“ wählen.');
      },
      async markPending(key) {
        const t = targets.get(key); if (!t) throw new Error('Kein Zielentwurf.'); writable(t.w);
        if (state(t)) throw new Error('Für diesen Entwurf wurde bereits eine Konferenz angefordert.');
        put(t, marker,'pending'); t.item=t.w.calendarItem; t.compose=t.w.gMsgCompose; t.pending = true;
      },
      async apply(key, conference) {
        const t = targets.get(key); if (!t?.pending) throw new Error('Kein angeforderter Zielentwurf.'); writable(t.w);
        const w = t.w;
        if (t.compose ? w.gMsgCompose !== t.compose : w.calendarItem !== t.item) throw new Error('Der Zielentwurf hat sich während der Erstellung geändert. Links bitte manuell übernehmen.');
        if (w.gMsgCompose) {
          const editor = w.GetCurrentEditor(); editor.beginTransaction();
          try { editor.endOfDocument(); if (w.gMsgCompose.composeHTML) editor.QueryInterface(Ci.nsIHTMLEditor).insertHTML('<br><br>' + conference.html); else editor.insertText('\n\n' + conference.bodyText); }
          finally { editor.endTransaction(); }
          w.gContentChanged = true;
        } else {
          const element = w.document.getElementById('item-description');
          const editor = element.getHTMLEditor(element.contentWindow);
          editor.beginTransaction();
          try { editor.endOfDocument(); editor.insertHTML('<br><br>' + conference.html); }
          finally { editor.endTransaction(); }
          w.document.getElementById('item-location').value = 'Meetling Konferenz';
          w.updateAccept?.();
        }
        put(t, marker,'created'); put(t,participant,conference.url);
      },
      release:async key => { targets.delete(key); },
      onInvoke:new ExtensionCommon.EventManager({context,name:'meetlingNative.onInvoke',register(fire) { notify=fire; return () => {notify=null;}; }}).api()
    }};
  }
};
