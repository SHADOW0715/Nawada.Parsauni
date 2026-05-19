Write-Host "Minifying CSS and JS..." -ForegroundColor Cyan

npx csso-cli style.css -o style.min.css
if ($LASTEXITCODE -ne 0) { throw "CSS minification failed." }

npx terser script.js -o script.min.js -c -m
if ($LASTEXITCODE -ne 0) { throw "JS minification failed." }

Write-Host "Minifying HTML..." -ForegroundColor Cyan
Get-ChildItem -Filter *.html | ForEach-Object {
  npx html-minifier-terser $_.FullName -o $_.FullName --collapse-whitespace --remove-comments --remove-redundant-attributes --remove-script-type-attributes --remove-style-link-type-attributes --minify-css true --minify-js true
  if ($LASTEXITCODE -ne 0) { throw "HTML minification failed: $($_.Name)" }
}

Write-Host "Done. Generated style.min.css and script.min.js." -ForegroundColor Green
