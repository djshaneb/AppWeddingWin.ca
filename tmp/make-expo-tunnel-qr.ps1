$qr = @(
  "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄",
  "█ ▄▄▄▄▄ █▄▄██████▄██▄▄█ ▄▄▄▄▄ █",
  "█ █   █ █ ▀█ ▄    ▀ ▄ █ █   █ █",
  "█ █▄▄▄█ █▄ ▄▄▀█▄▄▄█▀ ▀█ █▄▄▄█ █",
  "█▄▄▄▄▄▄▄█▄▀▄▀▄█▄█▄▀ ▀▄█▄▄▄▄▄▄▄█",
  "█  ▄ ▀▀▄█▄▀████ ▄  █▀▀▄▀▀ ▄ █ █",
  "██ ▀▄█▄▄█ ██▀▀▀███▄█▀▀ ██▀▀██▀█",
  "█▀█ █▀▄▄ ▄▄▀ █▀▀ ▀   █▄▀██▀▄ ▀█",
  "█▀█  ▀▄▄▀▀  █ ▀▄█ █▀▄▄▄█▄ █▄ ▄█",
  "█▄ ▀  ▀▄▄█▀ ▄▀▀█ ▀▀▀▄▀▄█▀▄█▀▀▄█",
  "█▄██▀▀▀▄▄▄▄▀▄ ██▄█▀▄▀█ █ █  ▀██",
  "██▄▄███▄▄ █▄▄  ▀█▀▄██ ▄▄▄ █▄  █",
  "█ ▄▄▄▄▄ ██▄█▄▄▄██▀▄▀▄ █▄█ ▄█ ██",
  "█ █   █ █▀▀█▀ █ ▀ ▄▄▀▄ ▄▄ ▄ █▀█",
  "█ █▄▄▄█ █ ▀  █▄▀▀▀▄ █ █▀█▀ █▀▄█",
  "█▄▄▄▄▄▄▄█▄███▄█▄███▄▄▄█▄▄▄▄█▄██"
)

Add-Type -AssemblyName System.Drawing

$module = 14
$margin = 6
$matrixWidth = ($qr | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum
$matrixHeight = $qr.Count * 2
$matrixSize = [Math]::Max($matrixWidth, $matrixHeight)
$canvasModules = $matrixSize + ($margin * 2)
$canvasSize = $canvasModules * $module
$offsetX = [Math]::Floor(($matrixSize - $matrixWidth) / 2) + $margin
$offsetY = [Math]::Floor(($matrixSize - $matrixHeight) / 2) + $margin

$bitmap = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$brush = [System.Drawing.Brushes]::Black

for ($row = 0; $row -lt $qr.Count; $row++) {
  $line = $qr[$row]
  for ($col = 0; $col -lt $line.Length; $col++) {
    $ch = $line[$col]
    $top = $false
    $bottom = $false

    if ($ch -eq [char]0x2588) {
      $top = $true
      $bottom = $true
    } elseif ($ch -eq [char]0x2580) {
      $top = $true
    } elseif ($ch -eq [char]0x2584) {
      $bottom = $true
    }

    $x = ($offsetX + $col) * $module
    $yTop = ($offsetY + ($row * 2)) * $module
    $yBottom = ($offsetY + ($row * 2) + 1) * $module

    if ($top) {
      $graphics.FillRectangle($brush, $x, $yTop, $module, $module)
    }
    if ($bottom) {
      $graphics.FillRectangle($brush, $x, $yBottom, $module, $module)
    }
  }
}

$out = "C:\Users\Shane\Documents\New project\AppWeddingWin.ca\expo-tunnel-qr.png"
$bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output $out
