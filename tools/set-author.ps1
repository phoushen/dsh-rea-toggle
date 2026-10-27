# 一条命令把项目里的作者占位符换成你的 GitHub 用户名。
# 用法：右键本文件 -> 使用 PowerShell 运行；或在终端里：
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\set-author.ps1 -GithubName 你的用户名
param([Parameter(Mandatory=$true)][string]$GithubName)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$targets = Get-ChildItem $root -Recurse -File -Include *.json, *.md, LICENSE |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\' }

$changed = 0
foreach ($f in $targets) {
  $text = [IO.File]::ReadAllText($f.FullName)
  if ($text -notmatch 'YOUR-GITHUB-USERNAME') { continue }
  $next = $text -replace 'YOUR-GITHUB-USERNAME', $GithubName
  [IO.File]::WriteAllText($f.FullName, $next, (New-Object Text.UTF8Encoding $false))
  Write-Host "  改好: $($f.FullName.Replace($root, '.'))"
  $changed++
}

Write-Host ""
if ($changed -eq 0) {
  Write-Host "没有找到 YOUR-GITHUB-USERNAME，可能已经改过了。" -ForegroundColor Yellow
} else {
  Write-Host "完成，共修改 $changed 个文件。作者名 = $GithubName" -ForegroundColor Green
  Write-Host "下一步：看根目录的 0-先读我-发布指南.md" -ForegroundColor Green
}