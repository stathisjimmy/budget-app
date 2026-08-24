/* Τεστ v26 — μπάρα εκκρεμών εισερχομένων.
 *
 * Δεν στήνει browser: βγάζει την πραγματική renderAlert() μέσα από το
 * index.html που θα ανέβει, και την τρέχει πάνω σε στημένο DOM. Έτσι το τεστ
 * ελέγχει τον κώδικα που φεύγει, όχι ένα αντίγραφό του.
 *
 * node test-v26-alert.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const SW   = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const GS   = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want){
  ok(name, got === want, 'πήρα ' + JSON.stringify(got) + ', περίμενα ' + JSON.stringify(want));
}
function group(t){ console.log('\n' + t); }

/* ── Απομόνωση της renderAlert από το index.html ── */
function extract(fnName){
  const start = HTML.indexOf('function ' + fnName + '(');
  if(start === -1) throw new Error('δεν βρέθηκε η ' + fnName + ' στο index.html');
  let i = HTML.indexOf('{', start), depth = 0;
  for(let j = i; j < HTML.length; j++){
    if(HTML[j] === '{') depth++;
    else if(HTML[j] === '}'){ depth--; if(depth === 0) return HTML.slice(start, j + 1); }
  }
  throw new Error('δεν έκλεισε η ' + fnName);
}

/* Ψεύτικο στοιχείο με classList ίδιας συμπεριφοράς */
function el(){
  const set = new Set();
  return {
    textContent: '',
    classList: {
      add: c => set.add(c),
      remove: c => set.delete(c),
      contains: c => set.has(c)
    },
    _on: () => set.has('on')
  };
}

let notifyCalls = 0;
function run(inbox){
  const nodes = { alert: el(), alertTitle: el(), alertSub: el() };
  notifyCalls = 0;
  const scope = {
    $: id => {
      if(!nodes[id]) throw new Error('άγνωστο id: ' + id);
      return nodes[id];
    },
    INBOX: inbox,
    maybeNotify: () => { notifyCalls++; }
  };
  const fn = new Function('$', 'INBOX', 'maybeNotify',
    extract('renderAlert') + '\nreturn renderAlert();');
  fn(scope.$, scope.INBOX, scope.maybeNotify);
  return {
    on: nodes.alert._on(),
    title: nodes.alertTitle.textContent,
    sub: nodes.alertSub.textContent,
    notify: notifyCalls
  };
}

const item = n => Array.from({length:n}, (_,i)=>({ row:i+2, amount:10, date:'2026-08-24', type:'expense' }));

group('Άδεια ουρά');
{
  const r = run([]);
  eq('η μπάρα μένει κρυφή', r.on, false);
  eq('δεν γράφεται τίτλος', r.title, '');
  eq('δεν γράφεται υπότιτλος', r.sub, '');
  eq('το push χαμηλού υπολοίπου καλείται κανονικά', r.notify, 1);
}

group('Μία εκκρεμότητα — ενικός');
{
  const r = run(item(1));
  eq('η μπάρα εμφανίζεται', r.on, true);
  eq('τίτλος στον ενικό', r.title, '1 εκκρεμής ειδοποίηση');
  eq('υπότιτλος στον ενικό', r.sub, 'Ήρθε από το κινητό και περιμένει κατηγορία.');
}

group('Πολλές εκκρεμότητες — πληθυντικός');
{
  const r = run(item(3));
  eq('η μπάρα εμφανίζεται', r.on, true);
  eq('τίτλος με τον αριθμό', r.title, '3 εκκρεμείς ειδοποιήσεις');
  eq('υπότιτλος στον πληθυντικό', r.sub, 'Ήρθαν από το κινητό και περιμένουν κατηγορία.');

  const big = run(item(12));
  eq('διψήφιος αριθμός', big.title, '12 εκκρεμείς ειδοποιήσεις');
}

group('Επιστροφή στο μηδέν (απόρριψη της τελευταίας)');
{
  const q = item(1);
  const before = run(q);
  eq('πριν: ορατή', before.on, true);
  q.splice(0, 1);
  const after = run(q);
  eq('μετά: κρυφή', after.on, false);
}

group('Το χαμηλό υπόλοιπο έφυγε από την οθόνη');
{
  const src = extract('renderAlert');
  ok('η renderAlert δεν κοιτάει πια MONTH.low', !/MONTH\s*\.\s*low/.test(src), src.match(/MONTH[^;]*/) || '');
  ok('η renderAlert δεν γράφει όριο σε €', !/threshold/.test(src));
  ok('η renderAlert διαβάζει το INBOX', /INBOX\s*\.\s*length/.test(src));
  ok('το maybeNotify διατηρήθηκε', /maybeNotify\s*\(\s*\)/.test(src));
  ok('η maybeNotify υπάρχει ακόμη στο αρχείο', HTML.indexOf('function maybeNotify(') !== -1);
}

group('Σήμανση (markup)');
{
  ok('το κουμπί της μπάρας ανοίγει τα Εισερχόμενα', /class="ab" onclick="openInbox\(\)"/.test(HTML));
  ok('δεν δείχνει πια στο openInsights', !/class="ab" onclick="openInsights\(\)"/.test(HTML));
  ok('υπάρχουν τα alertTitle/alertSub', /id="alertTitle"/.test(HTML) && /id="alertSub"/.test(HTML));
  ok('ο τίτλος δεν λέει πια «Χαμηλό υπόλοιπο»', !/id="alertTitle">Χαμηλό υπόλοιπο</.test(HTML));
}

group('Ανανέωση μετά από απόρριψη');
{
  const src = extract('rejectInbox');
  const hits = (src.match(/renderAlert\(\)/g) || []).length;
  ok('η rejectInbox ξανασχεδιάζει τη μπάρα (αισιόδοξα + μετά την απάντηση)', hits === 2, 'βρέθηκαν ' + hits);
}

group('Σφραγίδες έκδοσης');
{
  ok("index.html → APPVER 'v26'", /const APPVER = 'v26';/.test(HTML));
  ok("sw.js → cache 'proyp-v26'", /const CACHE = 'proyp-v26';/.test(SW));
  ok('Code.gs → BUILD v26', /const BUILD = 'v26 · 2026-08-24';/.test(GS));
  ok('δεν έμεινε πουθενά v25 stamp', !/proyp-v25/.test(SW) && !/APPVER = 'v25'/.test(HTML) && !/BUILD = 'v25/.test(GS));
}

console.log('\n' + '─'.repeat(46));
console.log(pass + ' πέρασαν, ' + fail + ' απέτυχαν');
process.exit(fail ? 1 : 0);
