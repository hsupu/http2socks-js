param()

Push-Location $PSScriptRoot
try {
    & node src\index.mjs --socks 127.0.0.1:50000 --listen 127.0.0.1:50001
}
finally {
    Pop-Location
}
