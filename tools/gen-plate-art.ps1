# gen-plate-art.ps1 · 六张图内任务板（Qwen-Image 2.1 Turbo · 本地出图）
# -------------------------------------------------------------
# 红线 6：本地生成统一走千问本地模型。模型在 E:\ai-models\qwen-image-2.1，
# 参数沿用该目录 run_preview.ps1（8 步 / CFG 1.0 / euler / sigmas turbo / 768×768，
# 文本编码器与 VAE 放 CPU、扩散放 Vulkan0 —— 8GB 显存的实测配置）。
# 公开参照登记：docs/ASSET_GOVERNANCE.md §14 的 2026-11-19 条目。
# 用法：powershell -File tools/gen-plate-art.ps1
$ErrorActionPreference = "Continue"

$SD = "E:\ai-tools\sdcpp\vulkan\sd-cli.exe"
$ROOT = "E:\ai-models\qwen-image-2.1"
$OUT = "C:\Users\ASUS\Desktop\新返航录\assets\scene\v4\facility"
New-Item -ItemType Directory -Force -Path $OUT | Out-Null

$COMMON = ", isometric three-quarter top view from above, one single centered object, dark gunmetal sci-fi prop, flat pure white background, no shadow, no reflection, no text, game asset"

$jobs = @(
  @{ name = 'tank-gauge';  prompt = "one industrial spaceship life-support tank panel, three round pressure gauges and three valve wheels, teal status lights, brushed steel" },
  @{ name = 'galley';      prompt = "one compact spaceship galley countertop, metal sink, stackable food trays, utensils and cups, amber indicator strip" },
  @{ name = 'rec-table';   prompt = "one small futuristic recreation table console, grid of six glowing square buttons, two short joysticks, cyan and amber lights" },
  @{ name = 'surgery';     prompt = "one compact surgical bay instrument table, articulated medical arm, three probes and a tool tray, teal medical cross emblem" },
  @{ name = 'target-lane'; prompt = "one shooting practice control panel, long horizontal rail, sliding crosshair marker, one amber target band, dark steel" },
  @{ name = 'shelf';       prompt = "one industrial cargo storage shelf unit with four horizontal levels, small crates and supply boxes, amber label strips" }
)

foreach ($j in $jobs) {
  $p = $j.prompt + $COMMON
  $o = Join-Path $OUT ($j.name + '.png')
  Write-Output "[gen-plate] " + $j.name
  $sdArgs = @(
    "--diffusion-model", "$ROOT\diffusion_models\qwen-image-2.1-turbo-Q4_K_M.gguf",
    "--vae", "$ROOT\vae\qwen_image_2.1_vae_bf16.safetensors",
    "--llm", "$ROOT\text_encoders\Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf",
    "-p", $p,
    "--cfg-scale", "1.0",
    "--sampling-method", "euler",
    "--sigmas", "qwen-image-2.1-turbo",
    "--steps", "8",
    "-W", "768", "-H", "768",
    "--backend", "clip=cpu,diffusion=vulkan0,vae=cpu",
    "--flash-attn", "off",
    "-s", "20261119",
    "-o", $o
  )
  & $SD @sdArgs 2>&1 | Select-Object -Last 3
  Write-Output ("[gen-plate] " + $j.name + " exit=" + $LASTEXITCODE)
}
Write-Output "[gen-plate] DONE"
