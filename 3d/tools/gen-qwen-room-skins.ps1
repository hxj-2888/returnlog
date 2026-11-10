# =============================================================
# gen-qwen-room-skins.ps1 - Qwen-Image 2.1 local batch for room skins
# -------------------------------------------------------------
# 2026-11-09 user decision: Qwen is the ONLY image model; SDXL retired.
#   The former "iron-plate rooms" exclusion (power/engine/armory/warehouse)
#   is LIFTED — all 10 rooms now generate wall + floor swatches (20 raw 768px).
#   (2026-11-07 originally covered only bridge/cam/ecosys/transit/fun/med.)
# Scope: per-room wall / floor surface swatches. The 10 shared cover/ GLB
# materials are global and stay untouched.
#
# This script only GENERATES raw 768px swatches (10 rooms x wall+floor).
# Turn them into seamless 1536px runtime textures with:
#   C:\Python314\python.exe 3d/tools/bake-qwen-room-skins.py
#
# Runner / weights / Turbo params are identical to gen-art-refs.ps1
# (sdcpp Vulkan, 8 steps, CFG 1.0, euler, qwen-image-2.1-turbo sigmas,
#  clip=cpu,diffusion=vulkan0,vae=cpu, no --offload-to-cpu).
# Qwen Research License: NON-COMMERCIAL. Local generation only.
# PowerShell 7 required (AGENTS.md red line). No online image service.
# Design references for the 4 formerly-excluded rooms taken from public
# sources per AGENTS.md red line 12 (SCP:SL armory lockers / switchgear /
# cargo-hold conventions); prompts below encode those ideas.
# =============================================================
param(
    [string]$Only = "",
    [int]$Size = 768,
    [int]$SeedBase = 20261107,
    [switch]$SurfacesOnly,
    [switch]$FloorsOnly
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 6) {
    Write-Host "PowerShell 7 required. Use: C:\Program Files\PowerShell\7\pwsh.exe" -ForegroundColor Red
    exit 1
}

$ROOT = "E:\ai-models\qwen-image-2.1"
$REPO = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$SD   = "E:\ai-tools\sdcpp\vulkan\sd-cli.exe"
$DIFF = "$ROOT\diffusion_models\qwen-image-2.1-turbo-Q4_K_M.gguf"
$LLM  = "$ROOT\text_encoders\Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf"
$VAE  = "$ROOT\vae\qwen_image_2.1_vae_bf16.safetensors"
$MAP  = Join-Path $REPO "3d\preview\data\map.json"

foreach ($p in @($SD, $DIFF, $LLM, $VAE, $MAP)) {
    if (-not (Test-Path $p)) { Write-Host "MISSING: $p" -ForegroundColor Red; exit 1 }
}

# 2026-11-09: SDXL retired, iron-plate exclusion lifted -> all 10 rooms.
$IRON_ROOMS = @()
$QWEN_ROOMS = @("bridge", "cam", "ecosys", "transit", "fun", "med", "power", "engine", "armory", "warehouse")

$NEG = "logo, watermark, signature, person, human, face, character, cartoon, sketch, lowres, blurry, jpeg artifacts, oversaturated, text, letters, words, numbers, digits, strong perspective, glossy reflection, glow, bloom, light spot, light source, lamp, vignette, uneven lighting, soft focus"

# Wall bodies are the project's own cabin descriptions (gen-art-refs.ps1 $CABIN_BODY).
$WALL = @{
    bridge = "large formal conference hall wall panel, dark charcoal acoustic panels with fine woven fabric inserts, warm amber accent light strips along the top edge, brushed aluminium trim rails, subtle wood-composite inlay bands, clean minimal wear, dignified and central"
    cam    = "technical equipment room wall panel, perforated steel mesh sections, cool cyan LED glow bleeding through the vent holes, dark navy composite panels, cable routing channels with clamps, anti-static coating sheen, precise and clinical"
    ecosys = "bio-laboratory wall panel, moisture-stained white composite, condensation droplets and running water marks, algae-green residue streaks along the seams, translucent nutrient tubing clips, speckled anti-slip surface, green grow-light glow reflected, organic grime in crevices"
    transit= "galley and cafeteria wall panel, food-service stainless steel with splash-back sheen, soft warm overhead glow, ceramic tile band, rounded hygienic coving at the corner, water spots and cleaning-cloth streaks, light scratches, cheerful utilitarian"
    fun    = "lounge wall panel, dark violet-accented acoustic padding panels, neon magenta strip glow, worn fabric upholstery inserts, scuffed gloss black trim, fingerprint smudges on shiny surfaces, retro-futurist leisure club mood"
    med    = "medical bay wall panel, clean matte white antimicrobial coating, pale cyan seam lighting, stainless steel rail bands, seamless hygienic joints with coved corners, faint disinfectant sheen, almost no wear, sterile and bright"
    power  = "electrical switchgear room wall panel, painted grey cabinet fronts with rows of breaker switches and small indicator lamps, overhead cable tray runs with clamps, arc-flash warning label plates, clean industrial enamel paint with edge chips"
    engine = "engine room wall panel, riveted boiler steel with heat discoloration blues and browns, piped conduit runs with bracket clamps, oil grime settled in the seams, caution yellow valve handles, heavy maintained machinery mood"
    armory = "armory wall panel, heavy gun-locker steel doors with recessed handles and ventilation louvers, pegboard weapon mounting strips, stencil-marked ammo crate faces, olive drab and gunmetal paint with edge wear, low hazard chevron band at the base"
    warehouse = "cargo hold wall panel, corrugated container steel with rack upright brackets and strap anchors, faded cargo stencil marks, dent and scratch wear, utilitarian freight mood"
}

# Floor bodies mirror floor_spec.json material semantics, but generated by Qwen.
# 2026-11-09 特征批：地板必须读出舱室身份（用户「军械库没有一点军械库样子」）。
# 参考 SCP:SL 军械库 / 公开硬表面素材：用 stencil 标线/设备 footprint/功能道面传达身份，
# 同时保持高频高对比锐利、均匀光照、严格无缝（不画整件设备，避免与上层家具打架）。
$FLOOR = @{
    bridge = "formal conference hall deck, dark charcoal woven carpet tiles with crisp warm amber concentric conference-ring inlay around a central round-table footprint, radial seat marker stitches, sharp tile edges, dignified dense fibre grain"
    cam    = "surveillance room deck, dark navy anti-static tiles with crisp cyan console-footprint rectangles and screen-wall alignment seams, small perforated vent grids, cable-route inlay lines, sharp high-contrast edges"
    ecosys = "bio-laboratory hydroponic deck, dark teal composite panels with crisp glowing cyan nutrient-channel seams and hexagonal grow-pad inlays, circular culture-tank footprints, fine anti-slip grit, sci-fi tech feel, no plain green grid"
    transit= "galley deck, warm charcoal terrazzo with crisp amber serving-lane lines and queue-direction chevrons, stainless drain channel, tray-return footprint marks, dense steel flecks, sharp aggregate"
    fun    = "lounge deck, deep slate carpet tiles with crisp neon magenta game-lane inlays and billiard-table footprint rectangles, arcade pad markers, sharp fibre grain, retro-futurist leisure mood"
    med    = "medical bay deck, matte pale sterile tiles with crisp pale cyan bed-footprint rectangles and a central surgery cross inlay, clean grey joint grid, hygienic coved seams, high-contrast sterile detail"
    power  = "switchgear room deck, grey epoxy with crisp cable-trench cover plates, bold yellow arc-flash safety zones and switchgear footprint outlines, sharp plate bolts, high-contrast scuff grain"
    engine = "engine room deck, steel diamond grating with sharp cross holes and bolt heads, reactor maintenance-ring stencil, oil stains and heat scorch marks, pipe-trench lines, raised checker tread, high contrast"
    armory = "armory deck, heavy steel checker plate with stenciled weapon-rack lane outlines and rifle silhouette stencils, ammo-crate footprint boxes, yellow-black ordnance loading lanes, rubber anti-fatigue matting strips, bolt heads, high contrast military storage feel"
    warehouse = "cargo hold deck, steel grating with sharp cross holes, forklift traffic lanes and pallet footprint rectangles, cargo slot index stencils, pallet drag scratches, container corner marks, high contrast freight feel"
}

# 2026-11-09 激进策略：除走廊/门外的共享表面材质也改千问（替换过期 SDXL）。
# 名字与 blender-ship.py 的 mat_family 一一对应；提示词取公开硬表面参照（AGENTS.md 红线 12）。
$SURFACE = @{
    "panel-metal"     = "brushed sci-fi steel wall panel surface, fine horizontal brush grain, recessed seam lines and flush hex bolts, subtle edge wear and fingerprint smudges, gunmetal grey, flat material swatch"
    "crate-steel"     = "heavy cargo crate steel surface, raised rib reinforcement and corner brackets, stencil cargo marks, chipped olive paint over steel, scratches and dent wear, flat material swatch"
    "fabric-weave"    = "dense upholstery fabric weave surface, tight cross-hatch textile grain, dark charcoal fibre with subtle sheen, slight pilling and wear, flat material swatch"
    "table-composite" = "smooth table top composite surface, matte dark wood-plastic composite with fine grain, faint cup rings and light scratches, low sheen, flat material swatch"
    "panel-white"     = "clean matte white antimicrobial panel surface, seamless hygienic joints, faint cyan seam line, almost no wear, sterile medical grade, flat material swatch"
    "hazard-stripe"   = "industrial hazard chevron stripe surface, alternating caution yellow and black diagonal bands, scuffed paint over steel, worn edges, flat material swatch"
    "warehouse-rack"  = "cargo rack upright steel surface, punched slot holes and bracket marks, faded orange rack paint over steel, scrape and load wear, flat material swatch"
    "cafeteria-top"   = "cafeteria serving counter stainless steel top surface, brushed food-service steel with splash-back sheen, water spots and cleaning-cloth streaks, light scratches, flat material swatch"
    "facility-panel"  = "equipment facility control panel surface, dark grey composite with recessed button grids and label plates, small indicator lamps, precise industrial wear, flat material swatch"
    "facility-screen" = "equipment facility display screen surface, dark glass with faint cyan UI glow grids and scanline sheen, subtle reflection, clean, flat material swatch"
}
$TAIL_SURF = "orthographic flat material swatch, physically based texture reference for 3D modeling, evenly lit, fine surface detail, seamless tiling look, no perspective, no objects"

$TAIL_WALL  = "flat material swatch, orthographic front view of a wall surface, sci-fi spaceship interior panel, physically based texture reference for 3D modeling, evenly lit, fine surface detail, seamless tiling look, weathered but maintained"
$TAIL_FLOOR = "flat material swatch, top-down orthographic view of a floor surface, sci-fi spaceship interior deck, physically based texture reference for 3D modeling, uniform diffuse ambient lighting with no lamps and no glow hotspots, high-frequency micro-detail of scratches grain and panel seams, exact seamless repeat tile, sharp focus, no perspective"

$map = Get-Content $MAP -Raw -Encoding UTF8 | ConvertFrom-Json
$accentOf = @{}
$moodOf = @{}
foreach ($r in $map.rooms) {
    $g = $r.theme.glow
    if ($g -and $g.Count -ge 3) {
        $accentOf[$r.id] = ("#{0:X2}{1:X2}{2:X2}" -f [int]([math]::Round([double]$g[0] * 255)), [int]([math]::Round([double]$g[1] * 255)), [int]([math]::Round([double]$g[2] * 255)))
    } else { $accentOf[$r.id] = "#F0A831" }
    $moodOf[$r.id] = if ($r.light -eq "dark") { "dark unlit room" } else { "bright lit room" }
}

$rooms = @($QWEN_ROOMS)
if ($Only -ne "") {
    # PowerShell 会把 -Only a,b,c 绑定成数组再转成空格串，两种分隔符都要兼容
    $sel = @($Only.Split([char[]]@(',', ' ', ';'), [System.StringSplitOptions]::RemoveEmptyEntries))
    $rooms = @($rooms | Where-Object { $sel -contains $_ })
}

$setName = if ($SurfacesOnly) { "surfaces" } else { "room-skins" }
$outDir  = Join-Path $ROOT "output\$setName"
$archDir = Join-Path $REPO "docs\qwen21\$setName"
New-Item -ItemType Directory -Force -Path $outDir  | Out-Null
New-Item -ItemType Directory -Force -Path $archDir | Out-Null

$items = @()
$n = 0
foreach ($rid in $rooms) {
    $items += [ordered]@{ slug = "$rid-wall";  room = $rid; kind = "wall";  seedOffset = $n
        prompt = "$($WALL[$rid]). accent colour $($accentOf[$rid]), $($moodOf[$rid]), $TAIL_WALL" }
    $n++
    $items += [ordered]@{ slug = "$rid-floor"; room = $rid; kind = "floor"; seedOffset = $n
        prompt = "$($FLOOR[$rid]). accent colour $($accentOf[$rid]), $($moodOf[$rid]), $TAIL_FLOOR" }
    $n++
}
if ($SurfacesOnly) {
    # 只出共享表面材质 swatch（替换过期 SDXL），不出舱室墙地。
    $items = @()
    $n = 0
    foreach ($name in ($SURFACE.Keys | Sort-Object)) {
        $items += [ordered]@{ slug = "surf-$name"; room = "shared"; kind = "surface"; seedOffset = $n
            prompt = "$($SURFACE[$name]) $TAIL_SURF" }
        $n++
    }
} elseif ($FloorsOnly) {
    # 2026-11-09 地板清晰度重出：只重出 10 舱地板（清晰无缝/无光斑提示词），墙不动。
    $items = @()
    $n = 0
    foreach ($rid in $rooms) {
        $items += [ordered]@{ slug = "$rid-floor"; room = $rid; kind = "floor"; seedOffset = $n
            prompt = "$($FLOOR[$rid]). accent colour $($accentOf[$rid]), $($moodOf[$rid]), $TAIL_FLOOR" }
        $n++
    }
}

Write-Host "[qwen-room-skins] items=$($items.Count) size=${Size}x${Size} seed_base=$SeedBase"
Write-Host "[qwen-room-skins] included: $($rooms -join ', ')  | SDXL retired 2026-11-09, no excluded rooms"
$results = @()
foreach ($it in $items) {
    $outFile = Join-Path $outDir ("{0}_{1}.png" -f $it.slug, $Size)
    $t0 = Get-Date
    $sdArgs = @(
        "--diffusion-model", $DIFF, "--vae", $VAE, "--llm", $LLM,
        "-p", $it.prompt, "-n", $NEG,
        "--cfg-scale", "1.0", "--sampling-method", "euler",
        "--sigmas", "qwen-image-2.1-turbo", "--steps", "8",
        "-W", "$Size", "-H", "$Size",
        "--backend", "clip=cpu,diffusion=vulkan0,vae=cpu",
        "--flash-attn", "off",
        "-s", "$($SeedBase + $it.seedOffset)",
        "-o", $outFile
    )
    & $SD @sdArgs 2>&1 | Out-Null
    $ok = Test-Path $outFile
    $sec = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
    if ($ok) { Copy-Item $outFile (Join-Path $archDir ("{0}_{1}.png" -f $it.slug, $Size)) -Force }
    Write-Host ("[{0,-18}] ok={1} {2}s" -f $it.slug, $ok, $sec)
    $results += [ordered]@{ slug = $it.slug; room = $it.room; kind = $it.kind
        seed = $SeedBase + $it.seedOffset; size = $Size; ok = [bool]$ok; sec = $sec
        file = $outFile; prompt = $it.prompt }
}

$manifest = [ordered]@{
    model = "Qwen-Image 2.1 Turbo Q4_K_M / Qwen3-VL-8B-Instruct UD-Q4_K_XL"
    runner = "sdcpp Vulkan sd-cli.exe"
    script = "3d/tools/gen-qwen-room-skins.ps1"
    pwsh_only = $true
    license = "Qwen Research License - NON-COMMERCIAL; 2026-11-07 user decision allows use in this non-commercial in-house build; commercial release requires replacement or separate licence."
    generated = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    set = $setName; size = $Size; seed_base = $SeedBase; steps = 8; cfg = 1.0
    included_rooms = $rooms
    excluded_iron_plate_rooms = @()   # 2026-11-09 SDXL 退役，铁板舱 exclusion 解除
    sdxl_retired = $true
    count = $results.Count
    ok_count = @($results | Where-Object { $_.ok }).Count
    items = $results
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $outDir "manifest.json") -Encoding UTF8
$manifest | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $archDir "manifest.json") -Encoding UTF8
Write-Host "[qwen-room-skins] done $($manifest.ok_count)/$($manifest.count) -> $outDir"
