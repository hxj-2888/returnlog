# =============================================================
# gen-qwen-crew-face.ps1 · 船员正面脸贴图（本地千问）
# -------------------------------------------------------------
# 船员不做表情，头部球体用一张正面脸贴图即可；不生成法线/表情。
# 产物：3d/assets/renders/qwen-crew-face/crew-face_512_sN.png（原始候选）
# 后续由 3d/tools/build-crew-textures.py 合成头部 UV 贴图。
#
# 用法（PowerShell 7）：
#   pwsh -File 3d/tools/gen-qwen-crew-face.ps1
# =============================================================
param(
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
$OUT  = Join-Path $REPO "3d\assets\renders\qwen-crew-face"

foreach ($p in @($SD, $DIFF, $LLM, $VAE)) {
    if (-not (Test-Path $p)) { Write-Host "MISSING: $p" -ForegroundColor Red; exit 1 }
}
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$NEG = "side view, profile, three quarter view, open mouth, teeth, smile, beard, glasses, hat, helmet, mask, hair covering face, strong shadow, dramatic lighting, cartoon, anime, text, watermark, multiple faces, blurry, lowres"

$PROMPTS = @(
    "stylized realistic human face, front view, neutral expression, eyes open, mouth closed, no hair, forehead and cheeks visible, symmetrical, soft even lighting, centered, plain light skin background, video game character face, detailed skin",
    "front view portrait of a calm human face, neutral expression, eyes open, no hair, symmetrical features, smooth skin, even studio light, centered, plain skin background, low-poly game character face texture",
    "human face texture for a game character, front view, neutral, eyes nose mouth, no hair, no beard, no glasses, even lighting, centered, plain skin background, stylized realism"
)

$results = @()
for ($i = 0; $i -lt $PROMPTS.Count; $i++) {
    $seed = $SeedBase + 30 + $i
    $outFile = Join-Path $OUT ("crew-face_512_s{0}.png" -f $seed)
    $t0 = Get-Date
    & $SD --diffusion-model $DIFF --vae $VAE --llm $LLM `
        -p $PROMPTS[$i] -n $NEG `
        --cfg-scale 1.0 --sampling-method euler --sigmas qwen-image-2.1-turbo --steps 8 `
        -W $Size -H $Size --backend "clip=cpu,diffusion=vulkan0,vae=cpu" --flash-attn off `
        -s $seed -o $outFile 2>&1 | Out-Null
    $ok = Test-Path $outFile
    $sec = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
    Write-Host ("[crew-face {0}] ok={1} {2}s" -f $i, $ok, $sec)
    $results += [ordered]@{ index = $i; seed = $seed; ok = [bool]$ok; sec = $sec; file = $outFile; prompt = $PROMPTS[$i] }
}

$manifest = [ordered]@{
    model = "Qwen-Image 2.1 Turbo Q4_K_M / Qwen3-VL-8B-Instruct UD-Q4_K_XL"
    runner = "sdcpp Vulkan sd-cli.exe"
    script = "3d/tools/gen-qwen-crew-face.ps1"
    license = "Qwen Research License - NON-COMMERCIAL; local generation only"
    sdxl_retired = $true
    generated = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    size = $Size; steps = 8; cfg = 1.0; seed_base = $SeedBase
    items = $results
}
$manifestPath = Join-Path $OUT "manifest_crew_face_$Size.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "[crew-face] manifest -> $manifestPath"
