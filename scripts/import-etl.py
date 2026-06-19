#!/usr/bin/env python
"""
import-etl.py — one-time migration of Gio's Excel training logs → Athlete Pro backup JSON.

The source sheets are mesocycle MATRICES (blocks PULL/LEGS/PUSH × period × weight grid),
not session logs. This transposes them into WorkoutRecords. Two period modes:
  • month/week  (Italy GYM_2023, 2025)         → approximate dates (month + week)
  • date-serial (England_GYM_2023)             → real dates (Excel serials)
Empty template sheets (no weights) and bodyweight sections are skipped.

Output: an Athlete Pro backup ({version,workouts,...}) for the in-app Import (DB.Backup.import).
Usage: python scripts/import-etl.py <file1.xlsx> <file2.xlsx> [--out path.json]
"""
import sys, zipfile, re, json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
sys.stdout.reconfigure(encoding='utf-8')

# ── xlsx reading (stdlib) ─────────────────────────────────────────────────
def local(t): return t.split('}')[-1]
def col_idx(ref):
    m=re.match(r'([A-Z]+)(\d+)',ref); c=0
    for ch in m.group(1): c=c*26+(ord(ch)-64)
    return c-1,int(m.group(2))
def _shared(z):
    o=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            o.append(''.join(t.text or '' for t in si.iter() if local(t.tag)=='t'))
    return o
def sheets(z):
    wb=ET.fromstring(z.read('xl/workbook.xml')); rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid={r.get('Id'):r.get('Target') for r in rels}; out=[]
    for s in wb.iter():
        if local(s.tag)=='sheet':
            r=[v for k,v in s.attrib.items() if k.endswith('}id')][0]; t=rid[r]
            out.append((s.get('name'), t if t.startswith('xl/') else 'xl/'+t))
    return out
def grid(z,target):
    sh=_shared(z); root=ET.fromstring(z.read(target)); g={}
    for row in root.iter():
        if local(row.tag)!='row': continue
        rn=int(row.get('r'))
        for c in row:
            if local(c.tag)!='c': continue
            ci,_=col_idx(c.get('r')); t=c.get('t'); v=''
            for ch in c:
                if local(ch.tag)=='v' and t=='s' and ch.text is not None:
                    try: v=sh[int(ch.text)]
                    except: pass
                elif local(ch.tag)=='v': v=ch.text or ''
                elif local(ch.tag)=='is': v=''.join(x.text or '' for x in ch.iter() if local(x.tag)=='t')
            g[(rn,ci)]=v
    return g

# ── parsing helpers ───────────────────────────────────────────────────────
MON={'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
def mnum(s):
    s=re.sub(r'[^a-z]','',str(s).lower())
    for k,v in MON.items():
        if s and s.startswith(k): return v
def is_wk(v):
    try: return int(float(v)) in (1,2,3,4)
    except: return False
def is_serial(v):
    try: return 43800.0 < float(v) < 47000.0   # Excel serial ~2019..2028
    except: return False
def serial_dt(n): return datetime(1899,12,30)+timedelta(days=float(n))
def reps_like(v): return bool(re.match(r'\s*\d+\s*[xXхХ×]',str(v)))
def parse_scheme(s):
    m=re.match(r'\s*(\d+)\s*[xXхХ×]\s*(.*)',str(s))
    if not m: return None,[]
    return int(m.group(1)),[int(n) for n in re.findall(r'\d+',re.split(r'rec',m.group(2))[0])]
def parse_weight(v):
    s=str(v).strip()
    if not s or s in ('-','L','M'): return None
    m=re.match(r'(-?\d+\.?\d*)',s)
    if not m: return None
    w=float(m.group(1))
    return w if 0<w<=500 else None   # drop negatives + leaked date-serials
def norm(s): return re.sub(r'\s+',' ',re.sub(r'[^a-zа-я0-9 ]',' ',str(s).lower())).strip()

GENERIC={'machine','bar','barbell','dumbbell','db','cable','low','high','seated','lying','standart','standard','block','degree','rec','with','the','to','chest'}
ALIAS={
 'down block standart':'Seated Cable Row','low block standart':'Seated Cable Row','low row block standart':'Seated Cable Row',
 'lat machine':'Lat Pulldown','latt pulldown':'Lat Pulldown','diverging lat pulldown':'Lat Pulldown','divergong seated row':'Seated Cable Row',
 'biceps machine':'Cable Curl','biceps tross pull up':'Cable Curl','biceps curl':'Barbell Curl',
 'shrugs':'Barbell Shrug','abs':'Crunch','rowing machine':'Seated Cable Row','pulley':'Seated Cable Row',
 'pressa 45':'Leg Press','press 45':'Leg Press','press 45°':'Leg Press',
 'affondi camminata':'Walking Lunge','lunges walk':'Walking Lunge','alzate laterali':'Dumbbell Lateral Raise','lateral raises':'Dumbbell Lateral Raise',
 'french press ez':'Skull Crusher (Lying Tricep Extension)','french press':'Skull Crusher (Lying Tricep Extension)',
 'push down corda':'Rope Pushdown','push down rope bar':'Rope Pushdown',
 'brusia':'Chest Dip','brusia deeps':'Chest Dip','deep bars brusia':'Chest Dip','deep bars pull up':'Chest Dip','deep bars':'Chest Dip',
 'pectoral fly':'Pec Deck Fly','pectoral fly chest':'Pec Deck Fly','ez curl':'EZ-Bar Curl',
 'lying leg curls':'Lying Leg Curl','leg extension':'Leg Extension','leg extensions':'Leg Extension',
 'abductor machine':'Hip Abduction Machine','calves':'Standing Calf Raise','calf press':'Standing Calf Raise',
 'chest press':'Machine Chest Press','chest press hammer strength':'Machine Chest Press','chest incline hammer strength':'Machine Chest Press',
 'converging chest press':'Machine Chest Press','barbell chest':'Barbell Bench Press',
 'triceps machine':'Tricep Pushdown','triceps machine barbell':'Tricep Pushdown',
 'shoulder press':'Seated Dumbbell Shoulder Press','hyperextension':'Back Extension (Hyperextension)',
 'bench presses 30 dumbbell':'Dumbbell Bench Press','sprinte panca30 dumbell':'Incline Dumbbell Bench Press',
 'pull up':'Pull-Up','deep bars pull up':'Chest Dip','curl al cavo basso con fune':'Cable Curl',
 'leg extansion':'Leg Extension','leg curl sdraiato':'Lying Leg Curl','tricepes machine':'Tricep Pushdown',
 'chest press 45':'Machine Chest Press','chest press hammer strenght':'Machine Chest Press',
}
def load_lib(path='exercises-library.json'):
    x=json.load(open(path,encoding='utf-8'))
    arr=x if isinstance(x,list) else (x.get('exercises') or list(x.values())[0])
    idx={}
    for e in arr:
        for k in (e.get('name'),e.get('nameRu')):
            if k: idx.setdefault(norm(k),e)
    return arr,idx
def match(raw,arr,idx):
    n=norm(raw)
    if n in ALIAS:
        a=norm(ALIAS[n])
        if a in idx: return idx[a],'alias'
    if n in idx: return idx[n],'exact'
    toks=set(n.split()); meaning=toks-GENERIC or toks
    best=None;bs=0
    for e in arr:
        cand=set(norm(e['name']).split())|set(norm(e.get('nameRu','')).split())|set(t.lower() for t in e.get('tags',[]))
        s=len(meaning&cand)/len(meaning) if meaning else 0
        if s>bs: bs=s;best=e
    return (best,'fuzzy') if bs>=0.8 else (None,'unmatched')

LABELS=['PULL','LEGS','PUSH']
def year_of(name):
    m=re.search(r'(20\d2|20\d\d)',name); return int(m.group(1)) if m else 2024

def detect_layout(g,rows,maxc,cell):
    reps_col=max(range(0,6),key=lambda c:sum(1 for r in rows if reps_like(cell(r,c))))
    def texty(r,c):
        s=str(cell(r,c)).strip()
        return bool(s) and not re.match(r'^-?\d+\.?\d*$',s) and not reps_like(s) and s.upper() not in LABELS
    name_col=max([c for c in range(0,6) if c!=reps_col],key=lambda c:sum(1 for r in rows if texty(r,c)))
    return name_col,reps_col

def global_mw(g,rows,maxc,cell,year):
    """Sheet-wide month/week grid (months are often defined once and reused by all blocks)."""
    wk_row=max(rows,key=lambda r:sum(1 for c in range(maxc+1) if is_wk(cell(r,c))),default=None)
    if not wk_row or sum(1 for c in range(maxc+1) if is_wk(cell(wk_row,c)))<4: return {}
    mrow=next((r for r in range(wk_row-1,0,-1) if any(mnum(cell(r,c)) for c in range(maxc+1))),None)
    if mrow is None: return {}
    cols={}; cur=None
    for c in range(maxc+1):
        m=mnum(cell(mrow,c))
        if m: cur=m
        if is_wk(cell(wk_row,c)) and cur:
            cols[c]=datetime(year,cur,min((int(float(cell(wk_row,c)))-1)*7+3,28))
    return cols

def block_periods(g,rows,maxc,cell,hr,year,gmw):
    """Per-block dates: prefer a local Excel-serial header (real dates, e.g. England);
       else fall back to the sheet-wide month/week grid (Italy / 2025)."""
    win=[r for r in rows if hr-3<=r<=hr+3]
    srow=max(win,key=lambda r:sum(1 for c in range(maxc+1) if is_serial(cell(r,c))),default=None)
    sers={c:float(cell(srow,c)) for c in range(maxc+1) if srow and is_serial(cell(srow,c))}
    if len(sers)>=2:
        cols={}; cur=None; k=0
        for c in range(maxc+1):
            if c in sers: cur=sers[c]; k=0
            if cur is not None and c>=min(sers): cols[c]=serial_dt(cur)+timedelta(days=k); k+=1
        return cols
    return gmw

def block_type(cell,r,maxc):
    for c in range(maxc+1):
        u=str(cell(r,c)).strip().upper()
        if u in LABELS: return u.lower()

# ── main ──────────────────────────────────────────────────────────────────
files=[a for a in sys.argv[1:] if not a.startswith('--')]
out_path=next((sys.argv[i+1] for i,a in enumerate(sys.argv) if a=='--out'),'C:/Users/Zephyrus/Downloads/qBit/athlete-pro-import.json')
arr,idx=load_lib()
workouts=[]; report={'sheets':[],'unmatched':{},'matched':0,'aliased':0,'fuzzy':0,'unm':0}

for path in files:
    z=zipfile.ZipFile(path)
    for name,target in sheets(z):
        g=grid(z,target)
        if not g: continue
        rows=sorted(set(r for r,_ in g)); maxc=max(c for _,c in g); cell=lambda r,c: g.get((r,c),'')
        year=year_of(name)
        name_col,reps_col=detect_layout(g,rows,maxc,cell)
        gmw=global_mw(g,rows,maxc,cell,year)
        heads=sorted(set(r for r in rows for c in range(maxc+1) if str(cell(r,c)).strip().upper() in LABELS))
        sheet_sessions=0
        for i,hr in enumerate(heads):
            end=heads[i+1] if i+1<len(heads) else max(rows)+1
            btype=block_type(cell,hr,maxc)
            periods=block_periods(g,rows,maxc,cell,hr,year,gmw)
            if not periods: continue
            exs=[]
            for r in range(hr+1,end):
                nm=str(cell(r,name_col)).strip()
                if not nm or nm.upper() in LABELS or mnum(nm) or nm.lower() in ('exercise','reps','ripetizioni','esercizio','week'): continue
                sets,reps=parse_scheme(cell(r,reps_col))
                wmap={c:parse_weight(cell(r,c)) for c in periods}
                if not any(v for v in wmap.values()): continue
                m,how=match(nm,arr,idx)
                exs.append({'raw':nm,'sets':sets,'reps':reps,'w':wmap,'m':m,'how':how})
                report[{'exact':'matched','alias':'aliased','fuzzy':'fuzzy','unmatched':'unm'}[how]]+=1
                if how=='unmatched': report['unmatched'][nm]=report['unmatched'].get(nm,0)+1
            # transpose: one session per period-column
            for c,dt in sorted(periods.items(),key=lambda kv:kv[1]):
                sx=[]
                for e in exs:
                    w=e['w'].get(c)
                    if w is None: continue
                    ns=e['sets'] or (len(e['reps']) or 1)
                    st=[{'weight':w,'reps':(e['reps'][k] if k<len(e['reps']) else (e['reps'][-1] if e['reps'] else None)),'rpe':None,'done':True} for k in range(ns)]
                    sx.append({'name':(e['m']['name'] if e['m'] else e['raw']),'sets':st})
                if not sx: continue
                ton=round(sum(s['weight']*(s['reps'] or 0) for ex in sx for s in ex['sets']))
                ts=int(dt.timestamp()*1000)
                workouts.append({'id':f'imp-{year}-{btype}-{dt.strftime("%Y%m%d")}-{c}','type':btype,'timestamp':ts,
                                 'duration':0,'tonnage':ton,'exercises':sx,'_source':f'{name}'})
                sheet_sessions+=1
        report['sheets'].append((name,sheet_sessions))

# dedup identical sessions (some source sheets paste a block twice → same id)
_seen=set(); _uniq=[]
for w in workouts:
    if w['id'] in _seen: continue
    _seen.add(w['id']); _uniq.append(w)
dup_removed=len(workouts)-len(_uniq); workouts=_uniq

backup={'version':1,'exportedAt':datetime.now().isoformat(),'_importedFrom':'Excel ETL','workouts':workouts,'orm':[],'metrics':[],'settings':{}}
open(out_path,'w',encoding='utf-8').write(json.dumps(backup,ensure_ascii=False,indent=2))

# ── report ──
print('SHEETS:')
for n,s in report['sheets']: print(f'  {n:<20} sessions={s}')
ds=sorted(w['timestamp'] for w in workouts)
print(f"\nTOTAL workouts: {len(workouts)} (deduped {dup_removed} identical re-pasted blocks)")
if ds: print(f"date range: {datetime.fromtimestamp(ds[0]/1000):%Y-%m-%d} … {datetime.fromtimestamp(ds[-1]/1000):%Y-%m-%d}")
print(f"name match → exact {report['matched']} · alias {report['aliased']} · fuzzy {report['fuzzy']} · UNMATCHED {report['unm']}")
if report['unmatched']:
    print("UNMATCHED names (kept as custom, need review):")
    for nm,ct in sorted(report['unmatched'].items()): print(f"   • {nm}  (x{ct})")
print(f"\nwrote: {out_path}")
