$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../assets'
[IO.Directory]::CreateDirectory($destination) | Out-Null
foreach ($mode in @('offline', 'online')) {
    $bitmap = [Drawing.Bitmap]::new(256, 256)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.Color]::Transparent)
    $color = if ($mode -eq 'online') {'#00d478'} else {'#edb95e'}
    $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml($color), 14)
    $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    $pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $shape = [Drawing.Drawing2D.GraphicsPath]::new()
    try {
        $shape.AddLine(128,24,212,56)
        $shape.AddLine(212,56,212,124)
        $shape.AddBezier(212,124,212,176,176,212,128,232)
        $shape.AddBezier(128,232,80,212,44,176,44,124)
        $shape.AddLine(44,124,44,56)
        $shape.CloseFigure()
        $graphics.DrawPath($pen,$shape)
        if ($mode -eq 'online') {
            $graphics.DrawLine($pen,88,124,116,152)
            $graphics.DrawLine($pen,116,152,172,92)
        } else {
            $graphics.DrawLine($pen,96,96,160,160)
            $graphics.DrawLine($pen,160,96,96,160)
        }
        $bitmap.Save((Join-Path $destination "shield-$mode.png"),[Drawing.Imaging.ImageFormat]::Png)
        if ($mode -eq 'offline') {
            $bitmap.Save((Join-Path $destination 'icon.png'),[Drawing.Imaging.ImageFormat]::Png)
            $icon = [Drawing.Icon]::FromHandle($bitmap.GetHicon())
            $stream = [IO.File]::Create((Join-Path $destination 'icon.ico'))
            try {$icon.Save($stream)} finally {$stream.Dispose();$icon.Dispose()}
        }
    } finally {$shape.Dispose();$pen.Dispose();$graphics.Dispose();$bitmap.Dispose()}
}
