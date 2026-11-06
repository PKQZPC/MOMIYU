function New-ProjectDirectory([string]$ProjectRoot, [string]$Directory) {
    $base = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
    $target = [IO.Path]::GetFullPath($Directory)
    if (-not $target.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'All application directories must stay inside the project.' }
    $current = $base
    foreach ($segment in $target.Substring($base.Length + 1).Split('\')) {
        $current = Join-Path $current $segment
        $item = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
        if ($item) {
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Project data directories cannot be files or reparse points.' }
        } else { New-Item -ItemType Directory -Path $current | Out-Null }
    }
    return $target
}
