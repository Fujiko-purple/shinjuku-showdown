import subprocess, struct, sys, os, math
sys.stdout.reconfigure(encoding='utf-8')
FF = os.path.join(os.environ['TEMP'], 'ffmpegx', 'ffmpeg-9.0.1-essentials_build', 'bin', 'ffmpeg.exe')
def raw(path, ss, t, ar=1000):
    o = subprocess.run([FF,'-v','error','-ss',str(ss),'-t',str(t),'-i',path,'-ac','1','-ar',str(ar),'-f','s16le','-'], capture_output=True)
    b=o.stdout; n=len(b)//2; return struct.unpack('<%dh'%n, b[:n*2])
def secrms(v): return [math.sqrt(sum(x*x for x in v[i:i+1000])/1000.0) for i in range(0,len(v)-1000,1000)]
def corr(a,b2):
    n=min(len(a),len(b2)); a=a[:n]; b2=b2[:n]
    ma=sum(a)/n; mb=sum(b2)/n
    num=sum((a[i]-ma)*(b2[i]-mb) for i in range(n))
    da=math.sqrt(sum((x-ma)**2 for x in a)); db=math.sqrt(sum((x-mb)**2 for x in b2))
    return num/(da*db) if da*db>0 else -2
src='_int/bili_audio.m4s'; new='dist/site/assets/bgm2.m4a'
n = secrms(raw(new, 0, 120))
a0 = secrms(raw(src, 0, 120))
a60 = secrms(raw(src, 60, 120))
a120 = secrms(raw(src, 120, 120))
print('每秒 RMS 点数: 新=%d 原0=%d 原60=%d 原120=%d' % (len(n),len(a0),len(a60),len(a120)))
print('相关系数  新BGM vs 原片 0:00  = %.4f' % corr(n,a0))
print('相关系数  新BGM vs 原片 1:00  = %.4f' % corr(n,a60))
print('相关系数  新BGM vs 原片 2:00  = %.4f' % corr(n,a120))
c0=corr(n,a0); c1=max(corr(n,a60),corr(n,a120))
print('前 12 秒每秒 RMS  新: ' + str([round(x) for x in n[:12]]))
print('前 12 秒每秒 RMS 原0: ' + str([round(x) for x in a0[:12]]))
print('前 12 秒每秒 RMS 原1: ' + str([round(x) for x in a60[:12]]))
print('结论: ' + ('✅ 新 BGM 就是原片开头（0:00 起）' if c0>0.95 and c0>c1+0.3 else '❌ 仍不是开头'))