# ============================================================
#  Bubbly 应用图标生成脚本
# ============================================================
#  用途: 重新生成 build/icon.png (512x512) 与 build/icon.ico (256x256)
#  运行: pwsh scripts/generate-icons.ps1
#  说明: 纯 GDI+ 程序化绘制品牌粉色心形（渐变 + 高光），
#        与 assets/tray-icon.png 托盘图标同一视觉语言。
# ============================================================

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root     = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root 'build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

function New-HeartPath {
  param([int]$CanvasSize)

  # 心形参数方程: x=16sin^3(t), y=13cos t-5cos 2t-2cos 3t-cos 4t
  # 数学 y 轴向上、屏幕 y 轴向下，绘制时取反并整体下移平衡留白
  $path  = New-Object System.Drawing.Drawing2D.GraphicsPath
  $count = 160
  $pts   = New-Object 'System.Drawing.PointF[]' $count
  $cx    = $CanvasSize / 2.0
  $cy    = $CanvasSize / 2.0
  $k     = $CanvasSize / 512.0 * 13.0        # 缩放系数（基准 512 画布）
  $off   = -30.0 * ($CanvasSize / 512.0)     # 垂直配平偏移

  for ($i = 0; $i -lt $count; $i++) {
    $t = 2 * [math]::PI * $i / ($count - 1)
    $x = 16 * [math]::Pow([math]::Sin($t), 3)
    $y = 13 * [math]::Cos($t) - 5 * [math]::Cos(2 * $t) `
       - 2 * [math]::Cos(3 * $t) - [math]::Cos(4 * $t)
    $pts[$i] = [System.Drawing.PointF]::new(
      [float]($cx + $x * $k),
      [float]($cy - $y * $k + $off))
  }
  $path.AddLines($pts)
  $path.CloseFigure()
  return $path
}

function New-Icon {
  param([int]$Size, [string]$Path)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  $heart = New-HeartPath $Size

  # 主体：左上 → 右下 粉色渐变
  $rect  = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 255, 138, 184),
    [System.Drawing.Color]::FromArgb(255, 236, 32, 108),
    [float]55)
  $g.FillPath($brush, $heart)

  # 描边：深玫瑰色，增强小尺寸下的轮廓辨识度
  $pen = New-Object System.Drawing.Pen(
    [System.Drawing.Color]::FromArgb(230, 200, 16, 82),
    [float]($Size / 512.0 * 6))
  $g.DrawPath($pen, $heart)

  # 高光：左上瓣的柔和白色椭圆（裁剪到心形内部）
  $g.Clip = New-Object System.Drawing.Region($heart)
  $gw = $Size * 0.46; $gh = $Size * 0.32
  $gx = $Size * 0.27; $gy = $Size * 0.19
  $gloss = New-Object System.Drawing.SolidBrush(
    [System.Drawing.Color]::FromArgb(60, 255, 255, 255))
  $g.FillEllipse($gloss, [float]$gx, [float]$gy, [float]$gw, [float]$gh)

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "已生成 $Path"
}

# 1. 主图标 512x512（electron-builder 自动缩放各尺寸）
$png512 = Join-Path $buildDir 'icon.png'
New-Icon -Size 512 -Path $png512

# 2. 中间产物 256x256 → 封装为 ICO（256 用 PNG 压缩条目）
$png256 = Join-Path $env:TEMP 'bubbly-icon-256.png'
New-Icon -Size 256 -Path $png256

$pngBytes = [System.IO.File]::ReadAllBytes($png256)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

$bw.Write([uint16]0)              # 保留字段
$bw.Write([uint16]1)              # 类型: 图标
$bw.Write([uint16]1)              # 条目数
$bw.Write([byte]0)                # 宽 256（0 表示 256）
$bw.Write([byte]0)                # 高 256
$bw.Write([byte]0)                # 调色板数
$bw.Write([byte]0)                # 保留
$bw.Write([uint16]1)              # 颜色平面
$bw.Write([uint16]32)             # 位深
$bw.Write([uint32]$pngBytes.Length)
$bw.Write([uint32]22)             # 数据偏移 = 6 + 16
$bw.Write($pngBytes)
$bw.Flush()

$icoPath = Join-Path $buildDir 'icon.ico'
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
Remove-Item $png256 -Force
Write-Host "已生成 $icoPath"

# 3. 校验：尺寸、透明角、中心粉色
$check = [System.Drawing.Bitmap]::new($png512)
$corner = $check.GetPixel(5, 5)
$center = $check.GetPixel(256, 300)
$check.Dispose()
if ($corner.A -ne 0) { throw '校验失败: 角落应为透明' }
if ($center.R -lt 200 -or $center.G -gt 160 -or $center.B -gt 200) { throw '校验失败: 中心应为粉色' }
$ico = [System.Drawing.Icon]::new($icoPath)
if ($ico.Width -ne 256 -or $ico.Height -ne 256) { throw '校验失败: ICO 应为 256x256' }
$ico.Dispose()
Write-Host '校验通过: 图标生成正确 ✓'
