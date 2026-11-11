# =============================================================
# gen-qwen-materials.ps1 · Qwen-Image 2.1 local batch for crew / weapon materials
# -------------------------------------------------------------
# 2026-11-11 user decision: SDXL 不出材质，人物与刀全部改用千问本地模型。
# 与 gen-qwen-room-skins.ps1 同一 runner / 权重 / Turbo 参数。
#
# 只产出「原始方图」到 3d/assets/renders/qwen-materials/（该目录 .gitignore 已忽略）。
# 裁成运行时贴图走：godot --headless --script tools/crop-materials.gd
#
# 用法（PowerShell 7）：
#   pwsh -File 3d/tools/gen-qwen-materials.ps1
#   pwsh -File 3d/tools/gen-qwen-materials.ps1 -Only knife-blade,knife-grip
# =============================================================
param(
    [string]$Only = "",
    [int]$Size = 512,
    [int]$SeedBase = 20261111
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
$OUT  = Join-Path $REPO "3d\assets\renders\qwen-materials"

foreach ($p in @($SD, $DIFF, $LLM, $VAE)) {
    if (-not (Test-Path $p)) { Write-Host "MISSING: $p" -ForegroundColor Red; exit 1 }
}
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

# 平铺材质的关键：正交、铺满画面、无物体边缘、无背景、无投影。
$BASE = "seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail"
$NEG  = "perspective, 3d object, product photo, blade shape, handle, shadow, gradient, vignette, white background, border, frame, text, watermark, logo, signature, person, hand, face, cartoon, sketch, oversaturated, blurry, lowres"

$ITEMS = @(
    @{ slug = "knife-blade"; seed = 1
       prompt = "brushed stainless steel surface with fine linear grind marks and sparse shallow scratches, cool grey metal, matte industrial finish, $BASE" }
    @{ slug = "knife-grip"; seed = 2
       prompt = "black rubber grip surface with fine cross-hatch knurling, matte finish, faint dust inside the grooves, dark charcoal tone, $BASE" }
    @{ slug = "crew-fabric"; seed = 3
       prompt = "light grey twill service-uniform fabric, tight diagonal weave, matte cotton blend, faint pilling and soft fold shading, $BASE" }
    @{ slug = "crew-webbing"; seed = 4
       prompt = "coral red nylon webbing strap, dense woven ribs, matte synthetic fibre, slight fraying along one edge, $BASE" }
    @{ slug = "crew-leather"; seed = 5
       prompt = "black leather with fine pebbled grain, scuffed matte finish, subtle creases, boot-grade hide, $BASE" }
    @{ slug = "crew-skin"; seed = 6
       prompt = "human skin surface close-up, natural pores and fine lines, warm neutral tone, soft even illumination with no highlights, $BASE" }
)

$want = @()
if ($Only -ne "") { $want = $Only.Split(",") | ForEach-Object { $_.Trim() } }
$items = @($ITEMS | Where-Object { $want.Count -eq 0 -or $want -contains $_.slug })

Write-Host "[qwen-materials] items=$($items.Count) size=${Size}x${Size} seed_base=$SeedBase"
$results = @()
foreach ($it in $items) {
    $outFile = Join-Path $OUT ("{0}_{1}.png" -f $it.slug, $Size)
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
    Write-Host ("[{0,-14}] ok={1} {2}s" -f $it.slug, $ok, $sec)
    $results += [ordered]@{ slug = $it.slug; seed = $SeedBase + $it.seed
        size = $Size; ok = [bool]$ok; sec = $sec; file = $outFile; prompt = $it.prompt }
}

$manifest = [ordered]@{
    model = "Qwen-Image 2.1 Turbo Q4_K_M / Qwen3-VL-8B-Instruct UD-Q4_K_XL"
    runner = "sdcpp Vulkan sd-cli.exe"
    script = "3d/tools/gen-qwen-materials.ps1"
    license = "Qwen Research License - NON-COMMERCIAL; local generation only"
    sdxl_retired = $true
    generated = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    size = $Size; steps = 8; cfg = 1.0; seed_base = $SeedBase
    count = $results.Count; ok_count = @($results | Where-Object { $_.ok }).Count
    items = $results
}
$manifestPath = Join-Path $OUT "manifest_materials_$Size.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "[qwen-materials] manifest -> $manifestPath"
