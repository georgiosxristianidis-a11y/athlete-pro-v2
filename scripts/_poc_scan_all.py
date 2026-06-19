import sys, zipfile, re
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
def local(t): return t.split('}')[-1]
def col_idx(ref):
    m=re.match(r'([A-Z]+)(\d+)',ref);
    if not m: return 0,0
    c=0
    for ch in m.group(1): c=c*26+(ord(ch)-64)
    return c-1,int(m.group(2))
def shared(z):
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
    sh=shared(z); root=ET.fromstring(z.read(target)); g={}
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
MON={'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
def mnum(s):
    s=re.sub(r'[^a-z]','',str(s).lower())
    for k,v in MON.items():
        if s and s.startswith(k): return v
def is_wk(v):
    try: return int(float(v)) in (1,2,3,4)
    except: return False
def reps_like(v): return bool(re.match(r'\s*\d+\s*[xXхХ×]',str(v)))
def w_ok(v):
    s=str(v).strip(); m=re.match(r'(-?\d+\.?\d*)',s)
    if not m: return False
    f=float(m.group(1)); return 0<f<=500
LABELS=['PULL','LEGS','PUSH']
GRAND=0
for path in sys.argv[1:]:
    z=zipfile.ZipFile(path)
    print('\n'+'='*64); print('FILE:',path.split('/')[-1])
    for name,target in sheets(z):
        g=grid(z,target);
        if not g: print(f'  · {name}: (пусто)'); continue
        rows=sorted(set(r for r,_ in g)); maxc=max(c for _,c in g); cell=lambda r,c: g.get((r,c),'')
        wk_row=max(rows,key=lambda r:sum(1 for c in range(maxc+1) if is_wk(cell(r,c))))
        wk_cnt=sum(1 for c in range(maxc+1) if is_wk(cell(wk_row,c)))
        month_row=next((r for r in range(wk_row-1,0,-1) if any(mnum(cell(r,c)) for c in range(maxc+1))),None)
        wcols={}
        if month_row is not None:
            cur=None
            for c in range(maxc+1):
                m=mnum(cell(month_row,c));
                if m: cur=m
                if is_wk(cell(wk_row,c)) and cur: wcols[c]=(cur,int(float(cell(wk_row,c))))
        reps_col=max(range(0,6),key=lambda c:sum(1 for r in rows if reps_like(cell(r,c))))
        name_col=max([c for c in range(0,5) if c!=reps_col],key=lambda c:sum(1 for r in rows if str(cell(r,c)).strip() and not re.match(r'^-?\d+\.?\d*$',str(cell(r,c)).strip()) and not reps_like(cell(r,c))))
        heads=sorted(set(r for r in rows for c in range(maxc+1) if str(cell(r,c)).strip().upper() in LABELS))
        sess=0; exrows=0
        if heads and wcols:
            for i,hr in enumerate(heads):
                end=heads[i+1] if i+1<len(heads) else max(rows)
                exs=[]
                for r in range(hr+1,end):
                    nm=str(cell(r,name_col)).strip()
                    if not nm or nm.upper() in LABELS: continue
                    wm={c for c in wcols if w_ok(cell(r,c))}
                    if not wm: continue
                    exs.append(wm); exrows+=1
                cols_used=set().union(*exs) if exs else set()
                sess+=len(cols_used)
        flag='' if (heads and wcols) else '  ⚠ нестандартная раскладка (даты-серийники/др.) — ручной маппинг'
        GRAND+=sess
        print(f'  · {name:<18} blocks={len(heads)} упр={exrows} weight_cols={len(wcols)} → сессий≈{sess}{flag}')
print(f'\nИТОГО реконструируемых сессий (макс. гранулярность, по чистым листам): ≈{GRAND}')
