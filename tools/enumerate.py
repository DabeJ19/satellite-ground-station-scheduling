# tools/enumerate.py — 獨立全列舉 oracle（純 Python，不依賴 engine）。用法：python3 tools/enumerate.py src/data/default.json [R1=7]
import json, itertools, sys
d=json.load(open(sys.argv[1]))
H=d['meta']['horizonMin']; cd=d['meta']['calibDefaultMin']
ants=[]
for s in d['stations']:
    for a in s['antennas']:
        ants.append(dict(id=a['id'],st=s['id'],band=a['band'],c=cd if a.get('calibMin') is None else a['calibMin']))
vis={}
for v in d['visibility']: vis.setdefault((v['sat'],v['station']),[]).append((v['start'],v['end']))
def cands(r):
    out=[]
    for a in ants:
        if a['band']!=r['band']: continue
        for (vs,ve) in vis.get((r['sat'],a['st']),[]):
            lo=max(r['start'],vs,0); hi=min(r['end'],ve,H)-r['durMin']
            for t in range(lo,hi+1): out.append((a['id'],t))
    return out
reqs=d['requests']
if len(sys.argv)>2:  # override durMin for a request: id=dur
    k,v=sys.argv[2].split('='); [r.update(durMin=int(v)) for r in reqs if r['id']==k]
C=[[None]+cands(r) for r in reqs]
amap={a['id']:a for a in ants}
best=None; nfeas=0; n5=0
for combo in itertools.product(*C):
    tasks=[(r,ch) for r,ch in zip(reqs,combo) if ch]
    ok=True
    for i in range(len(tasks)):
        ri,(ai,ti)=tasks[i]; ei=ti+ri['durMin']
        for j in range(i+1,len(tasks)):
            rj,(aj,tj)=tasks[j]; ej=tj+rj['durMin']
            if ri['sat']==rj['sat'] and ti<ej and tj<ei: ok=False;break
            if ai==aj:
                c=amap[ai]['c']
                if ti<ej+c and tj<ei+c: ok=False;break
        if not ok: break
    if not ok: continue
    nfeas+=1
    Z=len(tasks); W=sum(t-r['start'] for r,(a,t) in tasks)
    if Z==5: n5+=1
    key=(Z,-W)
    if best is None or key>best[0]: best=(key,[(r['id'],a,t) for r,(a,t) in tasks])
print('feasible',nfeas,'five-task',n5,'best (Z,W)=',(best[0][0],-best[0][1]),best[1])
