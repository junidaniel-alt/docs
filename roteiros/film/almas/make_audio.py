#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Synthesize an ambient score for '13 Almas Benditas' (offline, deterministic)."""
import numpy as np, wave, struct, os

SR = 44100
DUR = 246.0
N = int(SR * DUR)
t = np.arange(N) / SR
out = np.zeros(N, np.float32)

def note(freq, detune=0.0):
    return np.sin(2*np.pi*freq*t) + 0.5*np.sin(2*np.pi*(freq*(1+detune))*t)

# ---- low drone (continuous), slow swell ----
lfo = 0.5 + 0.5*np.sin(2*np.pi*0.03*t)
drone = (0.6*np.sin(2*np.pi*55*t) + 0.3*np.sin(2*np.pi*110*t)
         + 0.12*np.sin(2*np.pi*82.4*t)) * (0.25 + 0.15*lfo)
out += drone

# ---- evolving pad: chord segments with crossfades ----
def f(n):  # midi-ish name to freq via semitone from A2=110
    return n
# chord frequencies (Hz) per segment: (start, end, [freqs])
segs = [
    (0,   28,  [110.0, 130.8, 164.8]),          # A minor
    (28,  62,  [73.4,  87.3, 110.0]),           # D minor (darker)
    (62,  104, [110.0, 130.8, 164.8, 196.0]),   # A minor add
    (104, 140, [130.8, 164.8, 196.0]),          # C major (lift)
    (140, 190, [82.4, 98.0, 123.5]),            # E minor
    (190, 246, [110.0, 164.8]),                 # A open fifth (resolve)
]
pad = np.zeros(N, np.float32)
for (s,e,freqs) in segs:
    i0, i1 = int(s*SR), int(e*SR)
    seg = np.zeros(i1-i0, np.float32)
    tt = t[i0:i1]
    for k,fr in enumerate(freqs):
        vib = 1 + 0.004*np.sin(2*np.pi*(0.12+0.03*k)*tt)
        seg += (np.sin(2*np.pi*fr*tt*vib) + 0.4*np.sin(2*np.pi*2*fr*tt*vib))/(k+2)
    # equal-power crossfade envelope (1.5s ramps)
    env = np.ones(i1-i0, np.float32)
    rmp = int(1.5*SR)
    rmp = min(rmp, (i1-i0)//2)
    env[:rmp] = np.sin(np.linspace(0, np.pi/2, rmp))**1
    env[-rmp:] = np.cos(np.linspace(0, np.pi/2, rmp))**1
    pad[i0:i1] += seg*env*0.18
out += pad

# ---- soft bells at the 13 candle ignitions (scene 'thirteen' start=62, ignite 64..76) ----
def bell(at, freq=528.0, amp=0.22, dec=2.6):
    i0 = int(at*SR)
    L = int(dec*SR)
    if i0+L > N: L = N-i0
    tt = np.arange(L)/SR
    env = np.exp(-tt/ (dec*0.35))
    b = (np.sin(2*np.pi*freq*tt) + 0.6*np.sin(2*np.pi*freq*2.01*tt)
         + 0.3*np.sin(2*np.pi*freq*2.76*tt)) * env * amp
    out[i0:i0+L] += b

scale = [528.0, 594.0, 660.0]
for ci in range(13):
    bell(64 + ci*1.0, freq=scale[ci % 3], amp=0.16, dec=2.4)
# final bell
bell(232.0, freq=440.0, amp=0.22, dec=5.0)
bell(232.05, freq=660.0, amp=0.12, dec=5.0)

# ---- gentle stereo + simple space (one short echo) ----
echo = np.zeros(N, np.float32)
d = int(0.18*SR)
echo[d:] = out[:-d]*0.22
out = out + echo

# global fades
fi = int(2.0*SR); fo = int(4.0*SR)
out[:fi] *= np.linspace(0,1,fi)
out[-fo:] *= np.linspace(1,0,fo)

# normalize to -14 dBFS-ish
peak = np.max(np.abs(out)) + 1e-9
out = out / peak * 0.72

# slight stereo width: L/R with tiny delay
R = np.zeros(N, np.float32); dd=int(0.012*SR)
R[dd:] = out[:-dd]
L = out
stereo = np.stack([L, R], axis=1)
stereo = np.clip(stereo, -1, 1)
pcm = (stereo*32767).astype(np.int16)

path = os.path.join(os.path.dirname(__file__), "ambient.wav")
with wave.open(path, "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", path, round(DUR,1), "s")
