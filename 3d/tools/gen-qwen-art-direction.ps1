# =============================================================
# gen-qwen-art-direction.ps1 · 2026-11-11 美术方向四条裁定的本地千问材质
# -------------------------------------------------------------
# 只产出「原始方图」到 3d/assets/renders/qwen-art-direction/（.gitignore 忽略）。
# 运行时贴图由 3d/tools/build-art-direction.py 裁切/派生后写进 glb 或 preview/textures。
#
# 用法（PowerShell 7）：
#   pwsh -File 3d/tools/gen-qwen-art-direction.ps1
#   pwsh -File 3d/tools/gen-qwen-art-direction.ps1 -Only ceiling-deck,secbot-paint
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
$OUT  = Join-Path $REPO "3d\assets\renders\qwen-art-direction"

foreach ($p in @($SD, $DIFF, $LLM, $VAE)) {
    if (-not (Test-Path $p)) { Write-Host "MISSING: $p" -ForegroundColor Red; exit 1 }
}
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$BASE = "seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail"
$NEG  = "perspective, 3d object, product photo, shadow, gradient, vignette, white background, border, frame, text, watermark, logo, person, hand, face, cartoon, sketch, oversaturated, blurry, lowres"

$ITEMS = @(
    @{ slug = "ceiling-deck"; seed = 21
       prompt = "industrial pressed steel ceiling deck panels, dark gunmetal, stamped rectangular panels with recessed seams, subtle grime and fine scratches, matte painted finish, $BASE" }
    @{ slug = "ceiling-beam"; seed = 22
       prompt = "galvanized steel structural beam surface, cool grey metal, worn edges, faint rust at bolt holes, industrial, $BASE" }
    @{ slug = "ceiling-pipe"; seed = 23
       prompt = "painted steel industrial pipe surface, dark grey, clamp marks, oil grime, slightly worn paint, $BASE" }
    @{ slug = "secbot-paint"; seed = 24
       prompt = "painted steel armor plate surface, matte dark charcoal, chipped edges, fine wear and faint scratches, flat panel, $BASE" }
    @{ slug = "secbot-accent"; seed = 25
       prompt = "deep red industrial warning paint, slightly worn matte finish, fine scratches, dark crimson, $BASE" }
    @{ slug = "secbot-metal"; seed = 26
       prompt = "dark machined steel joint surface, oiled metal, worn edges, fine machining marks, gunmetal grey, $BASE" }
)

$want = @()
if ($Only -ne "") { $want = $Only.Split(",") | ForEach-Object { $_.Trim() } }
$items = @($ITEMS | Where-Object { $want.Count -eq 0 -or $want -contains $_.slug })

Write-Host "[qwen-art-direction] items=$($items.Count) size=${Size}x${Size} seed_base=$SeedBase"
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
    script = "3d/tools/gen-qwen-art-direction.ps1"
    license = "Qwen Research License - NON-COMMERCIAL; local generation only"
    sdxl_retired = $true
    generated = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    size = $Size; steps = 8; cfg = 1.0; seed_base = $SeedBase
    count = $results.Count; ok_count = @($results | Where-Object { $_.ok }).Count
    items = $results
}
$manifestPath = Join-Path $OUT "manifest_art_direction_$Size.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "[qwen-art-direction] manifest -> $manifestPath"
