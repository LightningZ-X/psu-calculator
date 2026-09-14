param([string]$q, [int]$count = 30)
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
$enc = [uri]::EscapeDataString($q)
$url = "https://www.bing.com/search?q=$enc&count=$count&setlang=en"
try {
  $r = Invoke-WebRequest -Uri $url -UserAgent $ua -TimeoutSec 30 -Headers @{ "Accept-Language" = "en-US,en;q=0.9" }
} catch {
  Write-Output "SEARCH-ERR: $($_.Exception.Message)"
  exit 1
}
$html = $r.Content
$ms = [regex]::Matches($html, '<h2><a[^>]*href="(http[^"]+)"[^>]*>(.*?)</a></h2>')
foreach ($m in $ms) {
  $u = $m.Groups[1].Value
  $t = $m.Groups[2].Value -replace '<[^>]+>', '' -replace '&amp;', '&' -replace '&#39;', "'" -replace '&quot;', '"'
  Write-Output "$t`n    $u"
}
if ($ms.Count -eq 0) {
  $ms2 = [regex]::Matches($html, '<a[^>]+href="(https?://(?!www\.bing\.com|go\.microsoft)[^"]+)"[^>]*h="[^"]*"[^>]*>(.*?)</a>')
  foreach ($m in $ms2) {
    $u = $m.Groups[1].Value
    $t = $m.Groups[2].Value -replace '<[^>]+>', ''
    if ($t.Trim().Length -gt 0) { Write-Output "$t`n    $u" }
  }
}
