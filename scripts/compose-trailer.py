"""Cut recorded gameplay frames into a silent store video ending on the cover art.

Usage: python3 scripts/compose-trailer.py <framesDir> <outroPng> <out.mp4> <W> <H> <plan.json>
plan.json: [{"dir": "l-catch", "parts": [[startSec, endSec, speed], ...]}, ...]
Each clip's parts are concatenated (sped up where speed > 1), clips are joined with short
crossfades, and the outro still gets a slow push-in. Output: H.264, 30 fps, no audio.
"""
import json
import subprocess
import sys

frames, outro, out, W, H, plan_path = sys.argv[1:7]
W, H = int(W), int(H)
plan = json.load(open(plan_path))
FPS = 30
XF = 0.35  # crossfade seconds
OUTRO = 2.6

inputs, chains, durs = [], [], []
for ci, clip in enumerate(plan):
    inputs += ['-framerate', str(FPS), '-i', f"{frames}/{clip['dir']}/f%04d.jpg"]
    parts = []
    total = 0.0
    for pi, (a, b, sp) in enumerate(clip['parts']):
        parts.append(f"[{ci}:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{sp},fps={FPS}[c{ci}p{pi}]")
        total += (b - a) / sp
    n = len(clip['parts'])
    chains += parts
    chains.append(''.join(f"[c{ci}p{pi}]" for pi in range(n)) + f"concat=n={n}:v=1:a=0,scale={W}:{H},setsar=1,format=yuv420p,settb=1/{FPS}[v{ci}]")
    durs.append(total)

oi = len(plan)
inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(OUTRO + XF), '-i', outro]
frames_out = int((OUTRO + XF) * FPS)
chains.append(
    f"[{oi}:v]scale={W * 2}:{H * 2},zoompan=z='1+0.06*on/{frames_out}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p,settb=1/{FPS}[v{oi}]"
)
durs.append(OUTRO + XF)

# chain crossfades
cur, t = 'v0', durs[0]
for i in range(1, len(durs)):
    nxt = f"x{i}"
    chains.append(f"[{cur}][v{i}]xfade=transition=fade:duration={XF}:offset={t - XF:.3f}[{nxt}]")
    t += durs[i] - XF
    cur = nxt
total = t
cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(chains), '-map', f'[{cur}]', '-t', f'{min(total, 19.8):.2f}',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]
subprocess.run(cmd, check=True)
print(f'{out}: {total:.2f}s')
