# =============================================================
# gen-qwen-crew-face-v2.ps1 · 船员脸（千问本地，风格化写实）
# -------------------------------------------------------------
# 2026-11-11 第二版：旧版照片脸在近景“伪人”；本脚本用参考图的风格化脸做 img2img，
# 再生成两张纯文字候选；原始图 512²（最终贴图由 build-crew-textures-v2.py 统一为 768²）。
# 产物：3d/assets/renders/qwen-crew-face/crew-face-v2_512_s*.png
# 用法：
#   pwsh -File 3d/tools/gen-qwen-crew-face-v2.ps1
# =============================================================
param(
    [int]$Size = 512,
    [int]$SeedBase = 20261160
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 6) {
    Write-Host "PowerShell 7 required." -ForegroundColor Red; exit 1
}

$ROOT = "E:\ai-models\qwen-image-2.1"
$REPO = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$SD   = "E:\ai-tools\sdcpp\vulkan\sd-cli.exe"
$DIFF = "$ROOT\diffusion_models\qwen-image-2.1-turbo-Q4_K_M.gguf"
$LLM  = "$ROOT\text_encoders\Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf"
$VAE  = "$ROOT\vae\qwen_image_2.1_vae_bf16.safetensors"
$OUT  = Join-Path $REPO "3d\assets\renders\qwen-crew-face"
$INIT = Join-Path $OUT "ref-head_512.png"

foreach ($p in @($SD, $DIFF, $LLM, $VAE, $INIT)) {
    if (-not (Test-Path $p)) { Write-Host "MISSING: $p" -ForegroundColor Red; exit 1 }
}
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$NEG = "photograph, photorealistic, hyperreal, harsh shadow, dramatic lighting, beard, stubble, glasses, hat, helmet, hair covering forehead, open mouth, teeth, side view, three quarter view, multiple faces, text, watermark, lowres, blurry"
$STYLE = "stylized realism video game character face albedo, hand-painted 3D game art, semi-realistic, smooth stylized skin, soft neutral studio light, front view, symmetrical, clean high forehead, no hair, eyes open, mouth closed, neutral expression, plain light warm grey background, centered"
$PROMPTS = @(
    "$STYLE, male face, strong jaw, calm eyes",
    "$STYLE, male face, angular cheekbones, calm eyes",
    "$STYLE, male face, soft jaw, calm eyes"
)

$results = @()
for ($i = 0; $i -lt $PROMPTS.Count; $i++) {
    $seed = $SeedBase + $i
    $outFile = Join-Path $OUT ("crew-face-v2_512_s{0}.png" -f $seed)
    $t0 = Get-Date
    $args = @(
        "--diffusion-model", $DIFF, "--vae", $VAE, "--llm", $LLM,
        "-i", $INIT, "--strength", "0.58",
        "-p", $PROMPTS[$i], "-n", $NEG,
        "--cfg-scale", "1.0", "--sampling-method", "euler",
        "--sigmas", "qwen-image-2.1-turbo", "--steps", "8",
        "-W", "$Size", "-H", "$Size",
        "--backend", "clip=cpu,diffusion=vulkan0,vae=cpu", "--flash-attn", "off",
        "-s", "$seed", "-o", $outFile
    )
    & $SD @args 2>&1 | Out-Null
    $ok = Test-Path $outFile
    $sec = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
    Write-Host ("[face-v2 {0}] ok={1} {2}s -> {3}" -f $i, $ok, $sec, $outFile)
    $results += [ordered]@{ index = $i; seed = $seed; ok = [bool]$ok; sec = $sec; file = $outFile; prompt = $PROMPTS[$i]; init = $INIT; strength = 0.58 }
}

$manifest = [ordered]@{
    model = "Qwen-Image 2.1 Turbo Q4_K_M / Qwen3-VL-8B-Instruct UD-Q4_K_XL"
    runner = "sdcpp Vulkan sd-cli.exe"
    script = "3d/tools/gen-qwen-crew-face-v2.ps1"
    license = "Qwen Research License - NON-COMMERCIAL; local generation only"
    sdxl_retired = $true
    generated = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    size = $Size; steps = 8; cfg = 1.0; init = "ref-head_512.png"; strength = 0.58
    items = $results
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OUT "manifest_crew_face_v2_$Size.json") -Encoding UTF8
Write-Host "[face-v2] done"
