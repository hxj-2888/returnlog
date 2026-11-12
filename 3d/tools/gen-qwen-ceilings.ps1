# =============================================================
# gen-qwen-ceilings.ps1 · 2026-11-12 天花板分舱千问贴图（用户裁定：
# 十舱各一张工业顶板平铺图；power/engine 出图后按拉闸断电亮度调色，
# 调色在 build-qwen-ceilings.py，本脚本只出原始方图）
# -------------------------------------------------------------
# 只产出「原始方图」到 3d/assets/renders/qwen-ceilings/（.gitignore 忽略）。
# 运行时贴图由 3d/tools/build-qwen-ceilings.py 裁切/派生后写进
# 3d/preview/assets/textures/qwen/<room>/ceiling*.png。
#
# 用法（PowerShell 7）：
#   pwsh -File 3d/tools/gen-qwen-ceilings.ps1
#   pwsh -File 3d/tools/gen-qwen-ceilings.ps1 -Only power,engine
# =============================================================
param(
    [string]$Only = "",
    [int]$Size = 768,
    [int]$SeedBase = 20261170
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
$OUT  = Join-Path $REPO "3d\assets\renders\qwen-ceilings"

foreach ($p in @($SD, $DIFF, $LLM, $VAE)) {
    if (-not (Test-Path $p)) { Write-Host "MISSING: $p" -ForegroundColor Red; exit 1 }
}
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

# 规范尾缀（与 ART_HANDOFF.md §6 一致）：正交平铺、无投影、无透视
$BASE = "seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail"
$NEG  = "perspective, 3d object, product photo, shadow, gradient, vignette, white background, border, frame, text, watermark, logo, person, hand, face, cartoon, sketch, oversaturated, blurry, lowres"

# 十舱工业顶板：按舱主题分色（theme.top 的方向，但饱和度压低），power/engine
# 的 prompt 自带深色工业语汇，拉闸亮度在派生脚本里统一压
$ITEMS = @(
    @{ room = "bridge";    seed = 1
       prompt = "spaceship command bridge ceiling deck panels, cool light grey pressed steel with recessed rectangular panels, slim cable conduits along seams, clean minimal wear, cool blue-grey tint, $BASE" }
    @{ room = "cam";       seed = 2
       prompt = "surveillance room ceiling deck, blue-grey pressed steel panels with perforated vent sections and slim cable ducts, cool cyan sheen on seams, clean industrial, $BASE" }
    @{ room = "ecosys";    seed = 3
       prompt = "hydroponics bay ceiling deck, green-grey painted steel panels with ventilation grille sections, faint moisture wear near seams, matte painted finish, $BASE" }
    @{ room = "power";     seed = 4
       prompt = "electrical power room ceiling, dark steel deck panels with heavy bolted cable trays and conduit runs, small junction boxes, faded caution yellow accents, sooty industrial wear, $BASE" }
    @{ room = "transit";   seed = 5
       prompt = "transit hub corridor ceiling deck, warm grey pressed steel panels with fine seam lines, subtle edge wear, neutral industrial finish, $BASE" }
    @{ room = "fun";       seed = 6
       prompt = "crew recreation room ceiling deck, purple-grey painted steel panels with flush recessed light coves, smooth clean semi-matte finish, subtle scuffs, $BASE" }
    @{ room = "med";       seed = 7
       prompt = "medical bay ceiling, clean matte white perforated steel panels, seamless hygienic joints, faint cool blue seam glow, sterile medical grade, almost no wear, $BASE" }
    @{ room = "engine";    seed = 8
       prompt = "engine room ceiling, dark sooty heavy steel deck panels, heat stain discoloration, oil grime around bolts, heavy industrial machinery hall, faded orange markings, $BASE" }
    @{ room = "armory";    seed = 9
       prompt = "armory ceiling deck, olive grey armored steel panels, recessed bolt lines and tie-down rails, weapon bay industrial, hard edge wear, $BASE" }
    @{ room = "warehouse"; seed = 10
       prompt = "cargo warehouse ceiling deck, blue-grey steel panels with mesh reinforcement strips, scuffed paint, forklift-grade cargo wear, $BASE" }
)

$want = @()
if ($Only -ne "") { $want = $Only.Split(",") | ForEach-Object { $_.Trim() } }
$items = @($ITEMS | Where-Object { $want.Count -eq 0 -or $want -contains $_.room })

Write-Host "[qwen-ceilings] items=$($items.Count) size=${Size}x${Size} seed_base=$SeedBase"
$results = @()
foreach ($it in $items) {
    $outFile = Join-Path $OUT ("{0}_{1}.png" -f $it.room, $Size)
    $t0 = Get-Date
    $sdArgs = @(
        "--diffusion-model", $DIFF, "--vae", $VAE, "--llm", $LLM,
        "-p", $it.prompt, "-n", $NEG,
        "--cfg-scale", "1.0", "--sampling-method", "euler",
        "--sigmas", "qwen-image-2.1-turbo", "--steps", "8",
        "-W", "$Size", "-H", "$Size",
        "--backend", "clip=cpu,diffusion=vulkan0,vae=cpu",
        "--flash-attn", "off",
        "-s", "$($SeedBase + $it.seed)",
        "-o", $outFile
    )
    & $SD @sdArgs 2>&1 | Out-Null
    $ok = Test-Path $outFile
    $sec = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
    Write-Host ("[{0,-9}] ok={1} {2}s" -f $it.room, $ok, $sec)
    $results += [ordered]@{ room = $it.room; seed = $SeedBase + $it.seed
        size = $Size; ok = [bool]$ok; sec = $sec; file = $outFile; prompt = $it.prompt }
}

$manifest = [ordered]@{
    model = "Qwen-Image 2.1 Turbo Q4_K_M / Qwen3-VL-8B-Instruct UD-Q4_K_XL"
    runner = "sdcpp Vulkan sd-cli.exe"
    script = "3d/tools/gen-qwen-ceilings.ps1"
    license = "Qwen Research License - NON-COMMERCIAL; local generation only"
    sdxl_retired = $true
    note = "ceiling per-room deck textures; power/engine graded to breaker-pulled brightness in build-qwen-ceilings.py"
    generated = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    size = $Size; steps = 8; cfg = 1.0; seed_base = $SeedBase
    count = $results.Count; ok_count = @($results | Where-Object { $_.ok }).Count
    items = $results
}
$manifestPath = Join-Path $OUT "manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "[qwen-ceilings] manifest -> $manifestPath"
