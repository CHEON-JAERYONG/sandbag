# 사진에서 얼굴을 눈 위치 기준으로 똑바로 세워 512x512로 잘라냄 (기본 얼굴 묶음 만들 때만 사용)
# 결과: faces-src/<이름>.jpg + faces-src/landmarks.json  (faces-src 는 git 에 올리지 않음)
param([string]$Out = "$PSScriptRoot/../faces-src", [switch]$Preview)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Out | Out-Null
$W = 512; $EYE_LINE = 0.45; $EYE_SPAN = 0.26
# 설정 파일(깃 제외): faces-src/faces.json = { source: 사진 폴더, faces: [{file,id,name,eL,eR,m,mask}] }
#   eL/eR = 사진 속 왼쪽/오른쪽 눈, m = 입 가운데 (원본 픽셀), mask = 얼굴로 쓸 타원(정렬 후 u,v,가로,세로)
$cfg = Get-Content (Join-Path $Out 'faces.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$Src = $cfg.source
$faces = $cfg.faces
$list = @()
foreach ($f in $faces) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $Src $f.file))
  $cx = ($f.eL[0] + $f.eR[0]) / 2; $cy = ($f.eL[1] + $f.eR[1]) / 2
  $ex = $f.eR[0] - $f.eL[0]; $ey = $f.eR[1] - $f.eL[1]
  $de = [Math]::Sqrt($ex * $ex + $ey * $ey)
  $px = -$ey / $de; $py = $ex / $de
  $dm = ($f.m[0] - $cx) * $px + ($f.m[1] - $cy) * $py
  $refLen = [Math]::Max($de, $dm / 1.08)
  $s = ($EYE_SPAN * $W) / $refLen
  $ang = [Math]::Atan2($ey, $ex) * 180 / [Math]::PI
  $bmp = New-Object System.Drawing.Bitmap $W, $W
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::FromArgb(255, 20, 20, 24))
  $mx = New-Object System.Drawing.Drawing2D.Matrix
  $mx.Translate(-$cx, -$cy, 'Append'); $mx.Rotate(-$ang, 'Append'); $mx.Scale($s, $s, 'Append'); $mx.Translate($W / 2, $EYE_LINE * $W, 'Append')
  $g.Transform = $mx
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
  $pts = [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF $f.eL[0], $f.eL[1]), (New-Object System.Drawing.PointF $f.eR[0], $f.eR[1]), (New-Object System.Drawing.PointF $f.m[0], $f.m[1]))
  $mx.TransformPoints($pts)
  $g.ResetTransform()
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
  $bmp.Save((Join-Path $Out "$($f.id).jpg"), $enc, $ep)
  $r = { param($v) [Math]::Round($v / $W, 4) }
  $list += [ordered]@{ id = $f.id; name = $f.name; mask = $f.mask; file = "$($f.id).jpg"; eyeL = @((& $r $pts[0].X), (& $r $pts[0].Y)); eyeR = @((& $r $pts[1].X), (& $r $pts[1].Y)); mouth = @((& $r $pts[2].X), (& $r $pts[2].Y)) }
  if ($Preview) {
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Lime), 2
    foreach ($p in $pts) { $g.DrawEllipse($pen, $p.X - 6, $p.Y - 6, 12, 12) }
    $gp = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 255, 255, 0)), 1
    for ($i = 0; $i -le 10; $i++) { $g.DrawLine($gp, $i * $W / 10, 0, $i * $W / 10, $W); $g.DrawLine($gp, 0, $i * $W / 10, $W, $i * $W / 10) }
    $bmp.Save((Join-Path $Out "$($f.id)-preview.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}
$json = ConvertTo-Json @($list) -Depth 5
[System.IO.File]::WriteAllText((Join-Path $Out 'landmarks.json'), $json, (New-Object System.Text.UTF8Encoding $false))
$json
