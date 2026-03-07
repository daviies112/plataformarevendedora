# ============================================================================
# SCRIPT DE INICIALIZACAO PARA WINDOWS (PowerShell) - REVENDA
# ============================================================================
# Este script substitui o start.sh para rodar nativamente no Windows

Write-Host "Iniciando servidor integrado (Express + Vite) na porta 5002..." -ForegroundColor Green
Write-Host ""

# Configurar variaveis de ambiente
$env:PORT = "5002"
$env:NODE_ENV = "development"

# Iniciar o servidor com tsx (TypeScript executor)
if (Get-Command "npx" -ErrorAction SilentlyContinue) {
    Write-Host "Starting with npx..."
    npx -y tsx server/index.ts
} else {
    Write-Host "npx not found, trying node_modules directly..."
    if (Test-Path "node_modules/.bin/tsx.cmd") {
        & "node_modules/.bin/tsx.cmd" server/index.ts
    } else {
        Write-Error "Could not find npx or tsx. Please install dependencies with 'npm install'."
    }
}
