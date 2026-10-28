# AI Video Editor — FFmpeg + HyperFrames + Groq

| Tool | Job |
|---|---|
| **FFmpeg** | Cuts dead air/silences, mixes audio |
| **Groq** (Whisper large-v3) | Transcribes Taglish with word timestamps |
| **HyperFrames** | Burns in animated word-by-word captions + graphics, renders MP4 |

## Setup
```bash
npm install
npx hyperframes browser ensure
export GROQ_API_KEY=gsk_...   # free at https://console.groq.com/keys
```

## Use
```bash
node edit.mjs input/myclip.mp4
```
Output: `output/myclip_edited.mp4`

Options: `--no-cut` (keep silences) · `--silence-db -35` · `--silence-min 0.5` · `--words 3` (words per caption)
· `--language tl` · `--music bgm.mp3` (ducked background music) · `--draft` (fast preview)
· `--transcript projects/x/transcript.json` (reuse a transcript, no API call)

To fine-tune, edit `projects/<name>/index.html` (fix a word, change colors via `--accent`), then:
`cd projects/<name> && npx hyperframes preview` or `npx hyperframes render -o out.mp4`.

## Grand-opening teaser (kinetic typography)
```bash
node teaser.mjs teaser.json        # -> output/teaser.mp4
```
Edit `teaser.json`: `brand`, `logo` (PNG path), `tagline`, `colors`, `music` (mp3 you have rights to), `size` (portrait/landscape/square).
Beat types: `blank` · `cut` (one word, hard cut) · `strobe` (2-frame style flicker) · `lockup` (bold + thin lines, `fadeOut`)
· `reveal` (letter-by-letter, `exit: "scatter"` for 3D letter explode) · `glitch` (VHS streak + RGB bars) · `end` (logo + tagline, music stops).
Any beat can take `"clip": "input/shot.mp4"` (+ `clipStart`, `tint`) to put your own footage behind the text.
