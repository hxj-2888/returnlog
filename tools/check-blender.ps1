<#
check-blender.ps1 —— 校验「新返航录」的权威渲染版本（Blender 5.2.2 LTS）

权威二进制（2026-11-01 定稿，见 AGENTS.md）：
  E:\SteamLibrary\steamapps\common\Blender\blender.exe
  = 桌面 C:\Users\ASUS\Desktop\Blender.lnk 指向的路径
  = Blender 5.2.2 LTS / build hash d13f752e3b9c / 免 Steam 登录

用法:
  powershell -ExecutionPolicy Bypass -File tools\check-blender.ps1
  powershell -File tools\check-blender.ps1 -Quiet      # 只回退出码

退出码: 0 = 通过；1 = 版本/路径/Python 载荷不符
#>
[CmdletBinding()]
param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$expectedVersion = '5.2.2'
$expectedHash    = 'd13f752e3b9c'

$root    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # repo 根
$lnkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Blender.lnk'
$authoritative = 'E:\SteamLibrary\steamapps\common\Blender\blender.exe'

function Fail($msg) {
    if (-not $Quiet) { Write-Host "[FAIL] $msg" -ForegroundColor Red }
    exit 1
}
function Say($msg) { if (-not $Quiet) { Write-Host $msg } }

# 1) 二进制存在
if (-not (Test-Path -LiteralPath $authoritative)) { Fail "权威路径不存在: $authoritative" }
$exe = Get-Item -LiteralPath $authoritative
Say ("路径  : {0}" -f $exe.FullName)
Say ("体积  : {0:N0} bytes" -f $exe.Length)

# 2) 桌面快捷方式是否仍指向它（用户口径：以 lnk 为准）
if (Test-Path -LiteralPath $lnkPath) {
    $shell = New-Object -ComObject WScript.Shell
    $target = $shell.CreateShortcut($lnkPath).TargetPath
    if ($target -ne $authoritative) {
        Fail "桌面 Blender.lnk 指向 $target，与权威路径不一致"
    }
    Say ("快捷方式: {0} -> 一致" -f $lnkPath)
} else {
    Say "[warn] 桌面没有 Blender.lnk，跳过快捷方式核对"
}

# 3) 版本与 build hash
$verLines = & $authoritative --version 2>&1 | Select-Object -First 6
$first = ($verLines | Select-Object -First 1)
Say ("版本  : {0}" -f "$first".Trim())
if ("$first" -notmatch [regex]::Escape("Blender $expectedVersion")) {
    Fail "版本不是 Blender $expectedVersion（期望 5.2.2 LTS）"
}
$hashLine = ($verLines | Where-Object { $_ -match 'build hash' } | Select-Object -First 1)
if ($hashLine -and "$hashLine" -notmatch [regex]::Escape($expectedHash)) {
    Fail "build hash 不符：$($hashLine.Trim())（期望 $expectedHash）"
}
if ($hashLine) { Say ("build : {0}" -f $hashLine.Trim()) }

# 4) 安装载荷完整性（4.x 便携包当年就栽在这里）
$py = Join-Path (Split-Path -Parent $authoritative) '5.2\python\bin\python.exe'
if (-not (Test-Path -LiteralPath $py)) { Fail "缺少 Python 载荷: $py" }
$addons = Join-Path (Split-Path -Parent $authoritative) '5.2\scripts\addons_core'
if (-not (Test-Path -LiteralPath $addons)) { Fail "缺少内置插件目录: $addons" }
Say ("Python : {0} (ok)" -f $py)
Say ("插件   : addons_core 就绪")

# 5) 免 Steam 依赖（DRM-free）
$dir = Split-Path -Parent $authoritative
foreach ($f in 'steam_api64.dll', 'steam_appid.txt') {
    if (Test-Path -LiteralPath (Join-Path $dir $f)) { Say "[warn] 发现 $f（Steam 版通常没有，确认是否改动过）" }
}

Say ""
Say "[OK] 权威渲染版本可用：Blender $expectedVersion LTS ($expectedHash)"
Say "     渲染模板：& '$authoritative' -b -P tools/blender-ship.py [-- --test]"
exit 0
