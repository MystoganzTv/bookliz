"""
Bookliz opening chime ("Solo sol"): two warm notes rising like the sun (G4 → D5,
with a soft D4 under the second) and one small glint on top.

Regenerate assets/sounds/opening.m4a:
  python3 scripts/splash-sound.py && ffmpeg -y -i opening.wav -c:a aac -b:a 160k assets/sounds/opening.m4a
"""
import numpy as np, scipy.signal as sg
from scipy.io import wavfile
SR=48000
rng=np.random.default_rng(11)
def hz(m): return 440*2**((m-69)/12)
def env(n,a,d):
    t=np.arange(n)/SR; return np.minimum(1,t/max(a,1e-4))*np.exp(-t/d)
class Mix:
    def __init__(s,dur): s.N=int(dur*SR); s.x=np.zeros((s.N,2))
    def add(s,sig,t0,pan=0.0,g=1.0):
        i=int(t0*SR); n=min(len(sig),s.N-i)
        s.x[i:i+n,0]+=sig[:n]*np.cos((pan+1)*np.pi/4)*g; s.x[i:i+n,1]+=sig[:n]*np.sin((pan+1)*np.pi/4)*g
    def done(s,name,room=0.05):
        irn=int(1.2*SR); ir=rng.standard_normal((irn,2))*np.exp(-np.arange(irn)/SR/0.35)[:,None]
        b,a=sg.butter(1,6000/(SR/2)); ir=sg.lfilter(b,a,ir,axis=0); ir[:int(0.01*SR)]=0
        wet=np.stack([sg.fftconvolve(s.x[:,c],ir[:,c])[:s.N] for c in range(2)],1)
        y=s.x+wet*room
        fl=int(0.25*SR); y[-fl:]*=np.linspace(1,0,fl)[:,None]**2
        y/=np.abs(y).max()/0.9
        wavfile.write(name+'.wav',SR,(y*32767).astype(np.int16))

def page_flip(dur=0.32, bright=1.0):
    """One crisp page turn: a swish whose pitch sweeps, with paper flutter and a little snap at the end."""
    n=int(dur*SR); t=np.arange(n)/SR
    noise=rng.standard_normal(n)
    # time-varying bandpass via short-time filtering in blocks
    out=np.zeros(n); blk=256
    for i in range(0,n,blk):
        f=1200+3800*bright*(i/n)**0.7
        b,a=sg.butter(2,[f*0.5/(SR/2),min(0.97,f*1.8/(SR/2))],'band')
        out[i:i+blk]=sg.lfilter(b,a,noise[max(0,i-512):i+blk])[-len(out[i:i+blk]):]
    flutter=0.55+0.45*np.abs(np.sin(2*np.pi*(38+70*t/dur)*t))   # paper crackle speeding up
    shape=np.sin(np.pi*np.clip(t/dur,0,1))**1.5 * (0.4+0.6*t/dur)
    s=out*flutter*shape
    # snap: the page lands
    sn=int(0.04*SR); snap=rng.standard_normal(sn)*env(sn,0.0005,0.006)
    b,a=sg.butter(2,[2500/(SR/2),9000/(SR/2)],'band'); snap=sg.lfilter(b,a,snap)
    s[-sn:]+=snap*3
    return s/np.abs(s).max()

def mallet(freq,dur,fm=1.6,decay=0.4):
    n=int(dur*SR); t=np.arange(n)/SR
    mod=np.sin(2*np.pi*freq*t)*fm*np.exp(-t/0.12)
    s=np.sin(2*np.pi*freq*t+mod)*0.75+0.2*np.sin(2*np.pi*freq*2*t)*np.exp(-t/0.3)+0.1*np.sin(2*np.pi*freq*4.02*t)*np.exp(-t/0.06)
    return s*env(n,0.003,decay)
def bell(freq,dur,decay=0.6):
    n=int(dur*SR); t=np.arange(n)/SR
    s=sum(a*np.sin(2*np.pi*freq*r*t)*np.exp(-t/(decay*d)) for r,a,d in [(1,1,1),(2.0,0.35,0.6),(2.76,0.25,0.35),(5.4,0.12,0.15),(8.93,0.05,0.08)])
    return s*env(n,0.002,10)
def thud(dur=0.25,f0=110):
    n=int(dur*SR); t=np.arange(n)/SR
    s=np.sin(2*np.pi*(f0*np.exp(-t*8)+45)*t)*env(n,0.002,0.06)
    b,a=sg.butter(2,1200/(SR/2)); air=sg.lfilter(b,a,rng.standard_normal(n))*env(n,0.001,0.02)*0.5
    return s+air


m=Mix(1.9)
m.add(mallet(hz(67),1.2,fm=1.3),0.02,pan=-0.12,g=0.5)
m.add(mallet(hz(74),1.7,fm=1.5,decay=0.6),0.20,pan=0.12,g=0.62)
m.add(mallet(hz(62),1.7,fm=0.8,decay=0.6),0.20,g=0.22)
m.add(bell(hz(98),1.0,0.35),0.23,pan=0.45,g=0.07)
m.done('opening')
