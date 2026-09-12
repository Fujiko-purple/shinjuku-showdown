import json, os, sys, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read().decode('utf-8'))
bvid='BV1MojB6iEdy'
v=get_json('https://api.bilibili.com/x/web-interface/view?bvid='+bvid)['data']
print('标题:', v['title'], '| 时长', v['duration'], 's')
p=get_json('https://api.bilibili.com/x/player/playurl?bvid=%s&cid=%s&fnval=16&fnver=0&fourk=1'%(bvid,v['cid']))['data']
audios=sorted((p.get('dash') or {}).get('audio') or [], key=lambda a: a.get('bandwidth') or 0, reverse=True)
best=audios[0]; print('音轨 id=%s %s kbps' % (best['id'], round(best['bandwidth']/1000)))
os.makedirs('_int', exist_ok=True)
out='_int/bili_audio.m4s'
for u in [best['baseUrl']] + list(best.get('backupUrl') or []):
    try:
        req=urllib.request.Request(u, headers={'User-Agent':UA,'Referer':'https://www.bilibili.com/','Origin':'https://www.bilibili.com','Accept':'*/*'})
        with urllib.request.urlopen(req, timeout=180) as r, open(out,'wb') as f:
            n=0
            while True:
                b2=r.read(1<<20)
                if not b2: break
                f.write(b2); n+=len(b2)
        print('下载完成 %.1f MB' % (n/1048576)); break
    except Exception as e: print('失败', u.split('/')[2], str(e)[:90])