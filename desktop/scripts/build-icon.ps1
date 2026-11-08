$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../assets'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$bitmap = [Drawing.Bitmap]::new(256, 256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$background = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#0b2931'))
$accent = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#55ded4'))
$font = [Drawing.Font]::new('Segoe UI', 124, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
try {
    $graphics.Clear([Drawing.Color]::Transparent)
    $shape = [Drawing.Drawing2D.GraphicsPath]::new()
    foreach ($corner in @(@(0,0,180),@(192,0,270),@(192,192,0),@(0,192,90))) {
        $shape.AddArc($corner[0],$corner[1],64,64,$corner[2],90)
    }
    $shape.CloseFigure()
    $graphics.FillPath($background,$shape)
    $graphics.DrawString('m',$font,$accent,42,40)
    $graphics.FillEllipse($accent,184,139,24,24)
    $bitmap.Save((Join-Path $destination 'icon.png'),[Drawing.Imaging.ImageFormat]::Png)
    $icon = [Drawing.Icon]::FromHandle($bitmap.GetHicon())
    $stream = [IO.File]::Create((Join-Path $destination 'icon.ico'))
    try {$icon.Save($stream)} finally {$stream.Dispose();$icon.Dispose()}
    $shape.Dispose()
} finally {$font.Dispose();$accent.Dispose();$background.Dispose();$graphics.Dispose();$bitmap.Dispose()}
