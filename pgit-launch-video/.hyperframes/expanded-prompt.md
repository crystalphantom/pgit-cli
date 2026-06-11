# PGit CLI — Twitter Launch Video · Production Breakdown

**Duration:** 86s · 1920x1080 · 30fps · Voiceover: Kokoro `af_nova` @1.05 (8 segments, `audio/vo-*.wav`)
**Audience:** AI-assisted developers, CLI power users. **Platform:** Twitter/X.

## Style block (from DESIGN.md — exact values)

- Background: Deep Void `#09090b` (all scenes — same base canvas)
- Card surface `#121214` · hover `#18181b` · terminal header `#0f0f13`
- Accent: Emerald Signal `#10b981` (actions/success/status ONLY — rarity is its power) · darker `#059669`
- Text `#ededed` · muted `#8e8e93`
- Semantic terminal-red `#f87171` — git untracked output + danger states only (DESIGN.md: "terminal commands and logs match actual CLI outputs exactly"; git prints untracked in red)
- Display/body: **Geist** (700/600 display at -0.03em, 350-400 body) · Mono: **JetBrains Mono**
- Corners: **0px everywhere.** Terminals get 1px `#27272a` borders (Terminal Mockup spec); sections/cards rely on surface contrast, never border+shadow combos.
- Mood: "The Clean Git Slate" — borderless dark-tech, precise, command-line purity. No gradients-as-text, no sketchy SVGs, no border+shadow pairing.

## Rhythm declaration

`hook — GLITCH — agony — ZOOM-PUNCH(reveal) — step — step — step — BLOCKS — shield — breathe-CTA`
Energy: medium-high launch. Fastest scenes: agony, reveal. Slowest: CTA hold.

## Global rules

- Every scene: grid-line BG texture (2px dashes, 4-6% opacity) + radial emerald glow (12-18%) + ghost mono type (4-6%, oversized, slow drift) + mono metadata labels FG (18-20px). 8-10 elements/scene.
- All decoratives breathe/drift/pulse on the seekable `tl` (finite repeats only).
- Entrances `tl.fromTo()`, ≥3 distinct eases/scene, no exits except final scene, first tween ≥0.15s after scene start.
- Typing effect: stepped clip reveal (`steps(n)` ease on width/clip-path) for terminal commands.
- VO segment starts ~0.6-0.8s after its scene's transition completes.

## Timeline (scene → window → VO)

| # | Scene     | Window      | VO file (dur)            | VO at |
|---|-----------|-------------|--------------------------|-------|
| 1 | Hook      | 0 – 10.5    | vo-01-hook (7.25)        | 0.9   |
| 2 | Agony     | 10.5 – 21.5 | vo-02-agony (7.55)       | 11.3  |
| 3 | Reveal    | 21.5 – 30.5 | vo-03-reveal (4.59)      | 22.5  |
| 4 | Add       | 30.5 – 41   | vo-04-add (7.15)         | 31.3  |
| 5 | Push+Drop | 41 – 54     | vo-05-pushdrop (9.13)    | 41.8  |
| 6 | Pull      | 54 – 64.5   | vo-06-pull (6.40)        | 54.8  |
| 7 | Safety    | 64.5 – 75   | vo-07-safety (6.83)      | 65.3  |
| 8 | CTA       | 75 – 86     | vo-08-cta (4.71)         | 75.9  |

Transitions: S1→S2 **glitch** 0.2s (system breaking) · S2→S3 **zoom-through** 0.55s (hero reveal, boldest) · S3→S4 **vertical push** 0.5s (into the workflow) · S4→S5, S5→S6 **push slide** 0.5s power3.inOut (primary — workflow steps read as one continuous strip) · S6→S7 **staggered blocks** (emerald + #121214, topic change) · S7→S8 **blur crossfade** 0.5s (wind-down). Final scene fades to black 84.6→85.8.

## Beats

### S1 — HOOK (0–10.5) "Your AI needs context"
**Concept:** We open mid-conversation with a coding agent. The agent asks for the things you can never give it in a shared repo. The viewer recognizes their own terminal instantly.
**Mood:** Claude-Code-session realism. Calm before tension.
**Depth:** BG grid + emerald radial glow top-left + ghost "CONTEXT" 380px mono 5% drifting. MG terminal mockup (1240px) — header tabs, user prompt `> build the payments retry flow`, agent reply typing on: "I'll need your API keys and the project spec to do this." MG-right: 4 floating file chips (`.env`, `.codex/`, `scratchpad.md`, `project-spec.md`) drifting at different depths. FG: kicker "AI-ASSISTED DEVELOPMENT" mono, headline "Your AI needs context." (Geist 84px), mono coords label bottom-right.
**Choreography:** terminal RISES (y:90→0 power3.out 0.8s) · header tabs fade-CASCADE · prompt line types on (steps) · agent reply lines CASCADE (power2.out) · chips FLOAT in from right staggered (back.out / sine / expo mixed) · headline slides from left (expo.out) · glow breathes ×3.

### S2 — AGONY (10.5–21.5) "Lose-lose"
**Concept:** The same workspace turns hostile. `git status` bleeds red untracked paths; a DO-NOT-COMMIT stamp slams like a customs rejection. Two doors, both bad.
**Mood:** Terminal alarm. Red signal cutting through the void.
**Depth:** BG grid + red radial glow (14%) pulsing + ghost "LEAK?" type. MG terminal: `$ git status` typed, output with red untracked block (.env, .codex/, scratch notes). MG: "DO NOT COMMIT" stamp (Geist 900, red border 4px, -5°) PUNCHES in with shake. FG: two dilemma panels (#121214): "Commit them → leaked to the whole org" / "Move them out → your agent goes blind", divider rule, mono label "LOSE-LOSE".
**Choreography:** command types on · red lines STAMP in rapid 0.08s stagger · stamp CRASHES (scale 2.6→1 power4.out + 3-frame shake) · panels SLIDE from opposite sides (power3.out / expo.out) · red glow pulses ×4.

### S3 — REVEAL (21.5–30.5) "Meet PGit CLI"
**Concept:** Cut the noise. Black void, one emerald bloom, the wordmark lands like a verdict. This is the centerpiece — maximum restraint, maximum confidence.
**Mood:** Cinematic title card. Lean-forward moment.
**Depth:** BG void + huge emerald bloom (radial, breathing) + ghost "PGIT" 460px 4%. MG: `$ pgit` wordmark (JetBrains Mono 700, 190px, `$` in emerald) SLAMS; "Meet PGit CLI." Geist 64px; subtitle "Agent-visible private config tracking for Git workspaces." FG: emerald rule draws scaleX, version chip `v0.9 · npm`, corner registration marks.
**Choreography:** bloom IGNITES (opacity 0→, scale 0.6→1 expo.out) · wordmark SLAMS (scale 1.5→1 + blur clear, power4.out 0.5s) · title rises (power3.out) · subtitle fades (sine.out) · rule DRAWS (power2.inOut) · chip pops (back.out).

### S4 — ADD (30.5–41) "Track privately, keep files real"
**Concept:** Split frame: the command on the left, the payoff on the right — an agent reading real files. The emerald dots flip on like circuit nodes.
**Depth:** BG grid + glow right + ghost "ADD". MG-left terminal: `$ pgit add .codex/ .env scratchpad.md` → output "✓ tracking 3 paths · files stay on disk". MG-right agent-view panel (#121214): file tree rows each gaining emerald ● TRACKED tag; footer "AI agent: reading real files ✓". FG: headline "Track privately. Keep files real." top, step label "01 / ADD" mono, divider.
**Choreography:** headline slides from left (expo.out) · terminal RISES (power3.out) · command types · output CASCADE · panel slides from right (power2.out) · rows light up emerald sequentially (0.15 stagger, sine.out pulse) · step label fades.

### S5 — PUSH+DROP (41–54) "Sync. Drop. Ship clean."
**Concept:** Two moves in one breath. Push: a progress bar fills to the private store. Drop: the files dissolve out of the tree and a PR-ready badge stamps. The repo exhales.
**Depth:** BG grid + glow left + ghost "SYNC". MG terminal (tall): `$ pgit push` → progress bar FILLS (scaleX, emerald) → "✓ synced → ~/.pgit/private-config"; then `$ pgit drop` → 3 file rows strike-through + fade to 35%; "✓ removed from working tree". MG-right badge "READY FOR PR REVIEW" (emerald fill, black text) STAMPS. FG: headline "Sync. Drop. Ship clean.", step label "02 / PUSH · 03 / DROP", mono path label.
**Choreography:** headline drops (power3.out) · push command types · bar FILLS (power1.inOut 1.2s) · success line pops · drop command types · rows STRIKE (scaleX rule across each, power2.in) and dim · badge STAMPS (scale 1.8→1 back.out(1.4)) · glow breathes.

### S6 — PULL (54–64.5) "Your context, on demand"
**Concept:** State machine made visible. MISSING → RESTORED → MODIFIED — three chips flipping as commands run. Round-trip in seconds.
**Depth:** BG grid + glow top + ghost "PULL". MG-left terminal: `$ pgit status` → "● 3 paths missing locally" (muted); `$ pgit pull` → "✓ restored .codex/ ✓ restored .env ✓ restored scratchpad.md" emerald; `$ pgit status` → "✎ todo.md modified locally". MG-right: vertical state rail — chips MISSING (gray) → RESTORED (emerald) → MODIFIED (amber #fbbf24, semantic status) connected by drawn line. FG: headline "Your context, on demand.", step label "04 / PULL · 05 / STATUS".
**Choreography:** headline rises (expo.out) · terminal slides from left (power3.out) · lines type/cascade in sequence timed to VO beats · rail line DRAWS (scaleY power2.inOut) · chips FLIP on (rotationX 60→0, staggered, back.out) · amber chip pulses once.

### S7 — SAFETY (64.5–75) "Hooks have your back"
**Concept:** The accident that doesn't happen. A tired `git commit -am "wip"` — intercepted mid-flight by the pre-commit hook. A shield panel slams down; the leak never exists.
**Mood:** Relief engineered. Emerald = guarded.
**Depth:** BG grid + emerald glow bottom + ghost "GUARD". MG terminal: `$ git commit -am "wip"` types · hook panel SLAMS from top over terminal: "⛔ pgit pre-commit hook — blocked 3 private paths from commit" with the 3 paths listed · terminal line "commit aborted. private files protected." FG: headline "Accidents happen. Leaks don't.", emerald shield-rule frame pulse, mono label "PRE-COMMIT / PRE-PUSH HOOKS — AUTO-INSTALLED".
**Choreography:** command types casually (slower steps — human) · panel SLAMS (y:-160→0 power4.out + 1 bounce settle) · red ⛔ flips to emerald ✓ tick · headline punches word-by-word (0.12 stagger) · frame pulse ×3.

### S8 — CTA (75–86) "Try PGit today"
**Concept:** Silence and one command. The whole video collapses into a single line you can copy. Centered deliberately — solemn close.
**Depth:** BG void + soft emerald bloom breathing + ghost "PGIT" faint. MG: `$ pgit` wordmark small, tagline "The privacy you need. The context your AI wants." Geist 56px, command pill (#121214, 1px terminal border): `npm install -g pgit-cli` JetBrains Mono 44px with blinking block cursor (finite repeats). FG: link `github.com/crystalphantom/pgit-cli` mono muted, corner marks.
**Choreography:** bloom swells (sine.inOut) · wordmark fades down (power2.out) · tagline rises split in 2 lines (expo.out stagger) · pill SCALES in (back.out(1.2)) · cursor blinks ×6 (steps) · link fades · ALL fades to black 84.6→85.8 (final-scene exception).

## Recurring motifs
Emerald = safety/action signal only. Ghost mono theme-word per scene (CONTEXT/LEAK?/PGIT/ADD/SYNC/PULL/GUARD/PGIT). Mono step labels `0N / VERB`. Same grid texture + glow language every scene. Terminal mockups identical chrome (header #0f0f13, 1px #27272a border, traffic dots muted).

## Negative prompt
No text gradients · no rounded corners >0px on structural blocks · no border+shadow pairing · no 1px borders around section wrappers/cards (terminals only) · no cyan/purple neon · no full-screen linear gradients (banding) · no `repeat:-1` · no exits before transitions (except S8) · emerald never used decoratively at full saturation outside signal moments.
