# =============================================================
# gen-art-refs.ps1 · 美术素材生成（千问本地模型 · 2026-11-07 解禁，可用于游戏内）
# -------------------------------------------------------------
# 两套产物：
#   -Set cabin  10 间舱室的墙面/表面材质参考        -> output\cabin-refs\
#   -Set tasks  26 个任务小游戏的控制面板参考        -> output\task-refs\
#   -Set crew   船员三视图 / 三配色 / 制服细节（2026-11-11） -> output\crew-refs\
#   -Set all    三套都跑（默认）
# 仓库留档：docs\qwen21\cabin-refs\、task-refs\ 与 crew-refs\
#
# 真源纪律：房间名 / 明暗 / 主题色 / 任务的玩法 kind / 元素数 n / 配色，
#   全部运行时读 3d\preview\data\map.json 与 minigames.json，不在脚本里硬编码。
#   人只写"这东西长什么样"的英文描述（美术取向无法从数据推出来）。
#
# 模型与路线（本机实测跑通，见 E:\ai-models\qwen-image-2.1\README.md）：
#   E:\ai-tools\sdcpp\vulkan\sd-cli.exe + Qwen-Image 2.1 Turbo Q4_K_M GGUF
#   8GB 显存：clip=cpu / diffusion=vulkan0 / vae=cpu，不加 --offload-to-cpu
#   Turbo 固定 8 步 + sigmas qwen-image-2.1-turbo + CFG 1.0 + euler
#   实测 768×768 约 97 s/张；512 草稿约 47 s/张
#
# 许可：Qwen Research License（非商用）。2026-11-07 用户裁定可用于本非商用项目运行时；
#   若未来发行 / 商用须换 SDXL / Qwen 1.0 或另行授权（AGENTS.md §一-6）。
#
# ⚠ 必须用 PowerShell 7（本机 7.6.5，C:\Program Files\PowerShell\7\pwsh.exe）：
#   Windows PowerShell 5.1 按 GBK 解码 UTF-8 源码，中文注释会吃掉换行导致解析失败。
#   脚本开头有硬守卫。项目规则也统一要求 pwsh（AGENTS.md §二）。
#
# 用法：
#   pwsh -File 3d/tools/gen-art-refs.ps1                     # 全部 36 张
#   pwsh -File 3d/tools/gen-art-refs.ps1 -Set tasks           # 只出 26 个任务面板
#   pwsh -File 3d/tools/gen-art-refs.ps1 -Set cabin -Size 512 # 草稿档
#   pwsh -File 3d/tools/gen-art-refs.ps1 -Only med,armory     # 按 id 过滤（cabin=舱室 id，tasks=任务名）
# =============================================================
param(
    [string]$Set = "all",
    [string]$Only = "",
    [int]$Limit = 0,
    [int]$Size = 768,
    [int]$SeedBase = 20261106
)

if ($PSVersionTable.PSVersion.Major -lt 6) {
    Write-Output ("FATAL 需要 PowerShell 7+，当前 {0}：5.1 会按 GBK 解码 UTF-8 源码，中文注释破坏解析" -f $PSVersionTable.PSVersion)
    Write-Output 'FATAL 请改用： & "C:\Program Files\PowerShell\7\pwsh.exe" -File 3d/tools/gen-art-refs.ps1'
    exit 1
}

$ErrorActionPreference = "Continue"
$SD   = "E:\ai-tools\sdcpp\vulkan\sd-cli.exe"
$ROOT = "E:\ai-models\qwen-image-2.1"
$DIFF = "$ROOT\diffusion_models\qwen-image-2.1-turbo-Q4_K_M.gguf"
$LLM  = "$ROOT\text_encoders\Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf"
$VAE  = "$ROOT\vae\qwen_image_2.1_vae_bf16.safetensors"

$REPO  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$MAPJS = Join-Path $REPO "3d\preview\data\map.json"
$MGJS  = Join-Path $REPO "3d\preview\data\minigames.json"

foreach ($f in @($SD, $DIFF, $LLM, $VAE, $MAPJS, $MGJS)) {
    if (-not (Test-Path $f)) { Write-Output "FATAL missing: $f"; exit 1 }
}

$map = Get-Content $MAPJS -Raw -Encoding UTF8 | ConvertFrom-Json
$mg  = Get-Content $MGJS  -Raw -Encoding UTF8 | ConvertFrom-Json

function To-Hex($rgb) {
    if ($null -eq $rgb -or @($rgb).Count -lt 3) { return "#808080" }
    # -f 的 X2 只吃整数；[math]::Round 返回 double 会报 Format specifier was invalid
    $parts = @($rgb) | Select-Object -First 3 | ForEach-Object { '{0:X2}' -f [int][math]::Round($_ * 255) }
    return '#' + ($parts -join '')
}

# ---------------- 通用词 ----------------
$NEG_BASE = "logo, watermark, signature, person, human, face, character, cartoon, sketch, lowres, blurry, jpeg artifacts, oversaturated, text, letters, words"
$NEG_DIGIT = "$NEG_BASE, numbers, digits"          # 禁止出现编号的玩法
$NEG_ALLOW = "$NEG_BASE"                            # code / valve / level 需要刻度与编号
# 人物参考图不能用 NEG_BASE（它专门禁人）；这里只禁文字与解剖错误。
$NEG_CREW = "logo, watermark, signature, text, letters, words, numbers, extra limbs, extra fingers, missing fingers, deformed hands, deformed face, asymmetric eyes, duplicate person, inconsistent outfit, helmet, armor, weapon, blurry, lowres, jpeg artifacts, cropped, out of frame, busy background, dramatic shadow"
$CREW_BASE = "adult spaceship crew member, slim athletic build, 1.75 m tall, short dark hair, no helmet, pale grey utility jumpsuit with coral-red chest harness, shoulder panels and knee pads, dark utility boots, small black backpack, matte fabric with clean seams, soft utilitarian sci-fi uniform, neutral friendly face, full body"

# ---------------- ① 十间舱室：表面材质 ----------------
$CABIN_BODY = @{
    bridge    = "large formal conference hall wall panel, dark charcoal acoustic panels with fine woven fabric inserts, warm amber accent light strips along the top edge, brushed aluminium trim rails, subtle wood-composite inlay bands, carpet meeting the wall at the bottom, clean minimal wear, dignified and central"
    cam       = "technical equipment room wall panel, perforated steel mesh sections, cool cyan LED glow bleeding through the vent holes, dark navy composite panels, cable routing channels with clamps, anti-static coating sheen, precise and clinical"
    ecosys    = "bio-laboratory wall panel, moisture-stained white composite, condensation droplets and running water marks, algae-green residue streaks along the seams, translucent nutrient tubing clips, speckled anti-slip surface, green grow-light glow reflected, organic grime in crevices"
    power     = "electrical room wall panel, dim unlit ambience with one weak light source, heavy amber hazard chevrons, high-voltage warning plates left blank, arc-scorch marks around switchgear housings, insulated rubber matting, riveted steel cabinets, oily fingerprints, deep shadows"
    transit   = "galley and cafeteria wall panel, food-service stainless steel with splash-back sheen, soft warm overhead glow, ceramic tile band, rounded hygienic coving at the corner, water spots and cleaning-cloth streaks, light scratches, cheerful utilitarian"
    fun       = "lounge wall panel, dark violet-accented acoustic padding panels, neon magenta strip glow, worn fabric upholstery inserts, scuffed gloss black trim, fingerprint smudges on shiny surfaces, retro-futurist leisure club mood"
    engine    = "engine room wall panel, heat-blued and oil-stained steel, orange-red warning glow from the reactor, heavy weld seams, riveted heat shielding plates, grease splatter and soot streaks near the floor, grated section, industrial and grimy, low light"
    med       = "medical bay wall panel, clean matte white antimicrobial coating, pale cyan seam lighting, stainless steel rail bands, seamless hygienic joints with coved corners, faint disinfectant sheen, almost no wear, sterile and bright"
    armory    = "armory wall panel, gunmetal grey armour plate, amber-ochre stencilled bands left blank, magnetic tool rack strips, scratched and dented steel, cordite dust in corners, heavy duty fasteners and bolts, hard utilitarian"
    warehouse = "cargo bay wall panel, corrugated steel with horizontal ribbing, amber hazard stripe band, forklift scuff marks at low level, pallet rack anchor points and bolt rows, dust and packaging fibres, worn paint edges, vast and utilitarian"
}

# ---------------- ② 26 个任务面板 ----------------
# 玩法 kind → 面板视觉语言（13 型）。元素数量 n 与配色 color 从 minigames.json 读。
$TASK_KIND = @{
    sync     = "control panel with parallel sliding fader channels, each channel a glowing horizontal band with a bright target window the sliders must line up with"
    place    = "parts tray panel, machined silhouette sockets in a row, matching physical components resting beside them, one decoy socket with no part"
    lever    = "rotary valve panel, circular handwheels with index ticks and a pointer, each wheel turned to its own marked notch"
    wire     = "electrical distribution panel close-up, real insulated cables routed between terminal blocks, three visible broken gaps where a wire has come loose, dark inner cavity behind the faceplate"
    pour     = "vertical fluid gauge panel, translucent tube with liquid rising into a highlighted safe band, graduated markings along the side, overflow warning zone above"
    swap     = "cartridge access panel, an opened slot holding a worn core module beside a fresh identical module, alignment keys and a release latch"
    sort     = "tray panel divided into two labelled bins, assorted small items on the surface above, a sliding divider between the compartments"
    sequence = "memory pad panel, a row of backlit buttons with one lit in sequence, soft silicone keys and a progress strip of indicator lamps"
    align    = "calibration panel with dashed target rings and draggable probe arms on gimbals, cross-hair readouts, tight tolerance markers"
    match    = "storage panel with a grid of hinged flip-doors, each door carrying a stamped icon, two doors open revealing matching contents"
    valve    = "instrument panel with three handwheels, each with degree graduations and a luminous set-line, torque indicator arcs"
    aim      = "weapons calibration panel, a moving bright band crossing a sight window with a reticle locked onto it, range scale along the bottom"
    code     = "legacy equipment panel with a row of worn engraved ID plates and a rotary digit selector, reconnect sockets numbered in old style"
    level    = "alignment panel with five stacked shelf rails, a dashed reference line across them and a bubble level vial showing deviation"
}

# 任务所在舱室的表面语境（让面板看起来属于这间房，而不是通用灰盒子）
$ROOM_SURFACE = @{
    bridge = "warm amber-lit conference hall, charcoal acoustic panels and brushed aluminium trim"
    cam = "cool cyan-lit technical room, perforated rack panels and navy composite"
    ecosys = "humid bio-lab, condensation-stained white composite with green grow-light glow"
    power = "dim electrical room, amber hazard chevrons and arc-scorched switchgear"
    transit = "bright galley, stainless splash-back and ceramic tile band"
    fun = "violet-neon lounge, padded acoustic panels and scuffed gloss trim"
    engine = "grimy engine room, heat-blued steel, soot and orange warning glow"
    med = "sterile medical bay, matte white antimicrobial coating and pale cyan seams"
    armory = "hard-worn armory, gunmetal armour plate and amber stencil bands"
    warehouse = "vast cargo bay, corrugated steel with amber hazard stripes and forklift scuffs"
}

# ---------------- 出图函数 ----------------
function Render-Set($setName, $items, $outDir, $archDir) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    # 函数内一律 Write-Host：PowerShell 会把未捕获的 Write-Output 一并塞进返回值，
    # 外层 $allResults += 就会把进度行当成结果条目计数（实测 done 2/5）。
    Write-Host "[$setName] items=$($items.Count) size=${Size}x${Size} seed_base=$SeedBase out=$outDir"
    $results = @()
    $i = 0
    foreach ($it in $items) {
        $outFile = Join-Path $outDir ("{0}_{1}.png" -f $it.slug, $Size)
        $t0 = Get-Date
        $sdArgs = @(
            "--diffusion-model", $DIFF, "--vae", $VAE, "--llm", $LLM,
            "-p", $it.prompt, "-n", $it.neg,
            "--cfg-scale", "1.0", "--sampling-method", "euler",
            "--sigmas", "qwen-image-2.1-turbo", "--steps", "8",
            "-W", "$Size", "-H", "$Size",
            "--backend", "clip=cpu,diffusion=vulkan0,vae=cpu",
            "--flash-attn", "off",
            "-s", "$($SeedBase + $it.seedOffset)",
            "-o", $outFile
        )
        & $SD @sdArgs 2>&1 | Out-Null
        $ok  = Test-Path $outFile
        $sec = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
        if ($ok) {
            New-Item -ItemType Directory -Force -Path $archDir | Out-Null
            Copy-Item $outFile (Join-Path $archDir ("{0}_{1}.png" -f $it.slug, $Size)) -Force
        }
        Write-Host ("[{0,-16}] {1,-9} accent={2} ok={3} {4}s" -f $it.slug, $it.tag, $it.accent, $ok, $sec)
        $results += [ordered]@{ id = $it.id; name = $it.name; set = $setName; kind = $it.tag
                                accent = $it.accent; size = "$Size"; seed = $SeedBase + $it.seedOffset
                                ok = [bool]$ok; sec = $sec; file = $outFile; prompt = $it.prompt }
        $i++
    }
    return $results
}

$pickCabin = ($Set -eq "all" -or $Set -eq "cabin")
$pickTasks = ($Set -eq "all" -or $Set -eq "tasks")
$pickCrew  = ($Set -eq "all" -or $Set -eq "crew")
$allResults = @()

# ---------------- 组 cabin 清单 ----------------
if ($pickCabin) {
    $rooms = @($map.rooms | Where-Object { $CABIN_BODY.ContainsKey($_.id) })
    if ($Only -ne "") { $rooms = @($rooms | Where-Object { $Only.Split(",") -contains $_.id }) }
    $cabinItems = @()
    $n = 0
    foreach ($r in $rooms) {
        $accent = To-Hex $r.theme.glow
        $mood = if ($r.light -eq "dark") { "dark unlit room" } else { "bright lit room" }
        $cabinItems += @{
            slug = $r.id; id = $r.id; name = $r.name; tag = "cabin"; accent = $accent
            seedOffset = $n
            prompt = "$($CABIN_BODY[$r.id]). accent colour $accent, $mood, flat material swatch, orthographic front view of a wall surface, sci-fi spaceship interior panel, physically based texture reference for 3D modeling, evenly lit, fine surface detail, seamless tiling look, weathered but maintained"
            neg = $NEG_DIGIT
        }
        $n++
    }
    $allResults += Render-Set "cabin" $cabinItems (Join-Path $ROOT "output\cabin-refs") (Join-Path $REPO "docs\qwen21\cabin-refs")
}

# ---------------- 组 tasks 清单 ----------------
if ($pickTasks) {
    $roomOf = @{}
    foreach ($p in $map.points) { $roomOf[$p.label] = $p.room }
    $tasks = @($mg.tasks.PSObject.Properties | ForEach-Object { $_.Name })
    if ($Only -ne "") { $tasks = @($tasks | Where-Object { $Only.Contains($_) }) }
    if ($Limit -gt 0 -and $tasks.Count -gt $Limit) { $tasks = @($tasks[0..($Limit - 1)]) }
    $taskItems = @()
    $n = 0
    foreach ($label in $tasks) {
        $cfg = $mg.tasks.$label
        $rid = $roomOf[$label]
        $room = $map.rooms | Where-Object { $_.id -eq $rid }
        $accent = if ($cfg.color) { $cfg.color } else { To-Hex $room.theme.mark }
        $kindDesc = $TASK_KIND[$cfg.k]
        if (-not $kindDesc) { Write-Output "[tasks] SKIP $label 未知玩法 $($cfg.k)"; continue }
        $surface = if ($ROOM_SURFACE[$rid]) { $ROOM_SURFACE[$rid] } else { "ship interior equipment surface" }
        $countTxt = if ($cfg.n -gt 0) { "$($cfg.n) interactive elements" } else { "continuous gauge, no discrete count" }
        # code / valve / level 需要刻度与编号，其余一律禁数字，免得模型糊出乱码文字
        $neg = if ($cfg.k -in @("code", "valve", "level")) { $NEG_ALLOW } else { $NEG_DIGIT }
        # slug 用序号 + 玩法，避免中文进文件名
        $slug = "{0:d2}-{1}-{2}" -f ($n + 1), $rid, $cfg.k
        $taskItems += @{
            slug = $slug; id = $label; name = $label; tag = $cfg.k; accent = $accent
            seedOffset = $n
            prompt = "$kindDesc, $countTxt, accent $accent, mounted in $surface, wall-mounted control panel close-up, slightly angled three-quarter view, painted metal bezel with recessed screws, screen glow and indicator lamps, physically based material reference for 3D modeling, high surface detail, clean composition, no user interface overlays, no readable labels"
            neg = $neg
        }
        $n++
    }
    $allResults += Render-Set "tasks" $taskItems (Join-Path $ROOT "output\task-refs") (Join-Path $REPO "docs\qwen21\task-refs")
}

# ---------------- 组 crew 清单（2026-11-11）----------------
# 设计基准：项目自己的 assets/scene/crew/crew-01.png（浅灰/珊瑚红制服、短黑发、
# 无头盔、背包）+ 通用宇航勤务服；不复制任何第三方角色资产。
if ($pickCrew) {
    $crewItems = @(
        @{
            slug = "crew-turnaround"; id = "crew_turnaround"; name = "船员三视图"; tag = "turnaround"
            accent = "#D9DEE6"; seedOffset = 100
            prompt = "$CREW_BASE, character turnaround reference sheet, front view, three-quarter view and back view of the same character, standing neutral A-pose, orthographic full-body views, evenly spaced, plain light neutral grey background, front and back clearly readable, concept art for 3D low-poly modeling, matte flat lighting, no text"
            neg = $NEG_CREW
        },
        @{
            slug = "crew-variants"; id = "crew_variants"; name = "船员三种配色"; tag = "variants"
            accent = "#B9C2CC"; seedOffset = 101
            prompt = "three spaceship crew members standing side by side, same slim 1.75 m body type and utility jumpsuit design, three colorways: pale grey with coral red, olive with amber, steel blue with teal, short hair, no helmets, no armor, full body neutral pose, plain light grey background, character lineup concept art for 3D low-poly modeling, evenly lit, no text"
            neg = $NEG_CREW
        },
        @{
            slug = "crew-detail"; id = "crew_detail"; name = "制服/装备细节"; tag = "detail"
            accent = "#C96A5D"; seedOffset = 102
            prompt = "character design detail sheet of the same sci-fi utility jumpsuit, chest harness, belt pouches, knee pads, dark boots, rolled sleeves, fabric seams, matte materials, pale grey with coral red accents, neutral grey background, three-quarter view, close-up, concept art for 3D modeling, no text"
            neg = $NEG_CREW
        }
    )
    if ($Only -ne "") { $crewItems = @($crewItems | Where-Object { $Only.Split(",") -contains $_.slug }) }
    $allResults += Render-Set "crew" $crewItems (Join-Path $ROOT "output\crew-refs") (Join-Path $REPO "docs\qwen21\crew-refs")
}

# ---------------- 清单 ----------------
$manifest = [ordered]@{
    model        = "Qwen-Image 2.1 Turbo Q4_K_M GGUF + Qwen3-VL-8B UD-Q4_K_XL + qwen_image_2.1_vae_bf16"
    runner       = "E:\ai-tools\sdcpp\vulkan\sd-cli.exe"
    script       = "3d/tools/gen-art-refs.ps1"
    pwsh_only    = "PowerShell 7 required (5.1 mis-decodes UTF-8 source as GBK)"
    license      = "Qwen Research License (non-commercial). 2026-11-07 user ruling: allowed for this non-commercial project, including in-game use; commercial release requires SDXL / Qwen 1.0 or separate licensing (AGENTS.md red line 6)."
    truth_source = "rooms/theme.glow <- map.json (export-map.cjs from blender-ship.py ROOM_THEME); tasks kind/n/color/hint <- minigames.json (export-minigames.cjs from js/t2/minigame.js TASKS)"
    set          = $Set
    size         = "$Size"
    seed_base    = $SeedBase
    steps        = 8
    cfg          = 1.0
    count        = $allResults.Count
    items        = $allResults
} | ConvertTo-Json -Depth 6
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($d in @("cabin-refs", "task-refs", "crew-refs")) {
    $dir = Join-Path $ROOT "output\$d"
    if (Test-Path $dir) {
        [System.IO.File]::WriteAllText((Join-Path $dir "manifest.json"), $manifest, $utf8)
        $arch = Join-Path $REPO "docs\qwen21\$d"
        New-Item -ItemType Directory -Force -Path $arch | Out-Null
        Copy-Item (Join-Path $dir "manifest.json") (Join-Path $arch "manifest.json") -Force
    }
}

$doneN = @($allResults | Where-Object { $_.ok }).Count
Write-Output "[art-refs] done $doneN/$($allResults.Count)"
