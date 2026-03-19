Write-Host "Minifying CSS and JS..." -ForegroundColor Cyan

npx csso-cli style.css -o style.min.css
if ($LASTEXITCODE -ne 0) { throw "CSS minification failed." }

npx terser script.js -o script.min.js -c -m
if ($LASTEXITCODE -ne 0) { throw "JS minification failed." }

Write-Host "Done. Generated style.min.css and script.min.js." -ForegroundColor Green
