import sys, zipfile, re, json
import xml.etree.ElementTree as ET
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')

def local(t): return t.split('}')[-1]
def col_idx(ref):
    m=re.match(r'([A-Z]+)(\d+)',ref)
    if not m: return 0,0
    L=m.group(1); c=0
    for ch in L: c=c*26+(ord(ch)-64)
    return c-1,int(m.group(2))
def load_shared(z):
    out=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            out.append(''.join(t.text or '' for t in si.iter() if local(t.tag)=='t'))
    return out
def read_sheet(z, want):
    wb=ET.fromstring(z.read('xl/workbook.xml')); rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid={r.get('Id'):r.get('Target') for r in rels}; target=None
    for s in wb.iter():
        if local(s.tag)=='sheet' and s.get('name')==want:
            r=[v for k,v in s.attrib.items() if k.endswith('}id')][0]; target=rid[r]
            if not target.startswith('xl/'): target='xl/'+target
    if not target: return None
    shared=load_shared(z); root=ET.fromstring(z.read(target)); g={}
    for row in root.iter():
        if local(row.tag)!='row': continue
        rn=int(row.get('r'))
        for c in row:
            if local(c.tag)!='c': continue
            ci,_=col_idx(c.get('r')); t=c.get('t'); val=''
            for ch in c:
                if local(ch.tag)=='v' and t=='s' and ch.text is not None:
                    try: val=shared[int(ch.text)]
                    except: pass
                elif local(ch.tag)=='v': val=ch.text or ''
                elif local(ch.tag)=='is': val=''.join(x.text or '' for x in ch.iter() if local(x.tag)=='t')
            g[(rn,ci)]=val
    return g

MON={'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
def month_num(s):
    s=re.sub(r'[^a-z]','',str(s).lower())
    for k,v in MON.items():
        if s.startswith(k): return v
    return None
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
    return w if 0<w<=500 else None
def norm(s): return re.sub(r'\s+',' ',re.sub(r'[^a-zа-я0-9 ]',' ',str(s).lower())).strip()

GENERIC={'machine','bar','barbell','dumbbell','db','cable','low','high','seated','lying','standart','standard','block','degree','rec','with','the','to','sdraiato'}
ALIAS={  # raw(normalized) -> canonical library name (seed; user confirms)
 'down block standart':'Seated Cable Row','lat machine':'Lat Pulldown','biceps machine':'Cable Curl',
 'biceps tross pull up':'Cable Curl','biceps curl':'Barbell Curl','shrugs':'Barbell Shrug','abs':'Crunch',
 'pressa 45':'Leg Press','press 45':'Leg Press','affondi camminata':'Walking Lunge','lunges walk':'Walking Lunge',
 'alzate laterali':'Lateral Raise','lateral raises':'Lateral Raise','french press ez':'Skull Crusher','french press':'Skull Crusher',
 'push down corda':'Triceps Pushdown','brusia':'Dips','deep bars brusia':'Dips','pectoral fly':'Cable Fly','pulley':'Seated Cable Row','ez curl':'EZ-Bar Curl',
}

def load_lib():
    x=json.load(open('exercises-library.json',encoding='utf-8'))
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
        s=len(meaning&cand)/len(meaning)
        if s>bs: bs=s;best=e
    return (best,round(bs,2)) if bs>=0.66 else (None,round(bs,2))

path=[p for p in sys.argv[1:] if read_sheet(zipfile.ZipFile(p),'2025')][0]
g=read_sheet(zipfile.ZipFile(path),'2025')
rows=sorted(set(r for r,_ in g)); maxc=max(c for _,c in g)
cell=lambda r,c: g.get((r,c),'')
def is_wk(v):
    try: return int(float(v)) in (1,2,3,4)
    except: return False
wk_row=max(rows,key=lambda r:sum(1 for c in range(maxc+1) if is_wk(cell(r,c))))
month_row=next((r for r in range(wk_row-1,0,-1) if any(month_num(cell(r,c)) for c in range(maxc+1))),wk_row-1)
wcols={}; cur=None
for c in range(maxc+1):
    mm=month_num(cell(month_row,c))
    if mm: cur=mm
    if is_wk(cell(wk_row,c)) and cur: wcols[c]=(cur,int(float(cell(wk_row,c))))
def reps_like(v): return bool(re.match(r'\s*\d+\s*[xXхХ×]',str(v)))
all_dr=[r for r in rows]
reps_col=max(range(0,6),key=lambda c:sum(1 for r in all_dr if reps_like(cell(r,c))))
name_col=max([c for c in range(0,4) if c!=reps_col],key=lambda c:sum(1 for r in all_dr if str(cell(r,c)).strip() and not re.match(r'^-?\d+\.?\d*$',str(cell(r,c)).strip()) and not reps_like(cell(r,c))))

# blocks
labels=['PULL','LEGS','PUSH']
heads=sorted([r for r in rows for c in range(maxc+1) if str(cell(r,c)).strip().upper() in labels],
             key=lambda r:r)
def block_type(r):
    for c in range(maxc+1):
        u=str(cell(r,c)).strip().upper()
        if u in labels: return u.lower()
heads=[(r,block_type(r)) for r in heads]
arr,idx=load_lib()
print(f'FILE {path.split(chr(47))[-1]} · SHEET 2025 · layout name_col={name_col} reps_col={reps_col} weight_cols={len(wcols)}')
print(f'blocks: {[(h[1],"r"+str(h[0])) for h in heads]}\n')

grand={'sessions':0,'matched':0,'aliased':0,'unmatched':0,'ex_seen':set()}
for i,(hr,btype) in enumerate(heads):
    end=heads[i+1][0] if i+1<len(heads) else max(rows)
    exs=[]
    for r in range(hr+1,end):
        name=str(cell(r,name_col)).strip()
        if not name or name.upper() in labels: continue
        sets,reps=parse_scheme(cell(r,reps_col))
        wmap={c:parse_weight(cell(r,c)) for c in wcols}
        if not any(v for v in wmap.values()) and not sets: continue
        m,how=match(name,arr,idx)
        exs.append({'name':name,'sets':sets,'reps':reps,'w':wmap,'m':m,'how':how})
    if not exs: continue
    # sessions per (month,week)
    sess={}
    for c,(mo,wk) in wcols.items():
        sx=[]
        for e in exs:
            w=e['w'].get(c)
            if w is None: continue
            ns=e['sets'] or (len(e['reps']) or 1)
            st=[{'weight':w,'reps':(e['reps'][k] if k<len(e['reps']) else (e['reps'][-1] if e['reps'] else None)),'rpe':None,'done':True} for k in range(ns)]
            sx.append({'name':(e['m']['name'] if e['m'] else e['name']),'sets':st})
        if sx:
            ton=sum(s['weight']*(s['reps'] or 0) for ex in sx for s in ex['sets'])
            sess[(mo,wk)]={'type':btype,'tonnage':round(ton),'date':f'2025-{mo:02d} w{wk}','exercises':sx}
    grand['sessions']+=len(sess)
    print(f'── {btype.upper()} (r{hr+1}..r{end-1}) · {len(exs)} упр · {len(sess)} сессий ──')
    for e in exs:
        tag={'exact':'✓','alias':'≈alias','exact':'✓'}.get(e['how'])
        if e['m'] and e['how'] in ('exact','alias'):
            mark='✓' if e['how']=='exact' else '≈'
            grand['matched' if e['how']=='exact' else 'aliased']+=1
        elif e['m']:
            mark='~'+str(e['how']); grand['matched']+=1
        else:
            mark='✗ UNMATCHED'; grand['unmatched']+=1
        grand['ex_seen'].add(e['name'])
        tgt=e['m']['name'] if e['m'] else '—'
        print(f"    {e['name']:<28}→ {tgt:<26} {mark}")
    print()

print('── ИТОГО по листу 2025 ──')
print(f"  упражнений уникальных: {len(grand['ex_seen'])}")
print(f"  сопоставлено точно: {grand['matched']} · через алиас: {grand['aliased']} · НЕ сопоставлено: {grand['unmatched']}")
print(f"  всего реконструировано сессий: {grand['sessions']}")
