@echo off
:: --- PROTEÇÃO 1: Garante que o script rode na pasta atual ---
cd /d "%~dp0"

title Sistema Solus - MODO DEBUG
color 0A

echo ========================================================
echo      SISTEMA DE BIOMETRIA FACIAL - SOLUS
echo      MODO DE RECUPERACAO E INICIALIZACAO
echo ========================================================
echo.
echo Diretorio Atual: %CD%
echo.

:: --- PASSO 1: TESTAR NODE.JS ---
echo [PASSO 1] Verificando Node.js...
node -v
IF %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [ERRO FATAL] O Node.js NAO esta instalado ou nao foi encontrado.
    echo Por favor, baixe e instale: https://nodejs.org/
    echo.
    echo Pressione qualquer tecla para sair...
    pause
    exit
)
echo [OK] Node.js encontrado.
echo.

:: --- PASSO 2: TESTAR ARQUIVO JS ---
echo [PASSO 2] Procurando 'reconhecimentofacial.js'...
if not exist "reconhecimentofacial.js" (
    color 0C
    echo.
    echo [ERRO] O arquivo 'reconhecimentofacial.js' NAO existe nesta pasta!
    echo Verifique se voce salvou o arquivo com o nome correto.
    echo.
    echo Conteudo da pasta atual:
    dir /b
    echo.
    pause
    exit
)
echo [OK] Arquivo principal encontrado.
echo.

:: --- PASSO 3: INSTALAR DEPENDENCIAS ---
echo [PASSO 3] Verificando bibliotecas...
if not exist "node_modules" (
    echo    - Pasta 'node_modules' nao existe. Instalando tudo agora...
    echo    - Isso pode demorar alguns minutos. Aguarde...
    call npm install express body-parser sqlite3 face-api.js canvas @tensorflow/tfjs-node
) else (
    echo    - Bibliotecas ja existem. Atualizando...
    call npm install
)
echo [OK] Dependencias verificadas.
echo.

:: --- PASSO 4: VERIFICAR MODELOS ---
echo [PASSO 4] Verificando pasta 'models'...
if not exist "models" (
    color 0E
    echo.
    echo [AVISO] A pasta 'models' nao foi encontrada!
    echo O sistema vai iniciar, mas o reconhecimento facial vai falhar.
    echo Crie a pasta 'models' e coloque os arquivos la.
    echo.
    pause
) else (
    echo [OK] Pasta models encontrada.
)
echo.

:: --- PASSO 5: INICIAR ---
echo [PASSO 5] Iniciando o sistema agora...
echo ========================================================
echo    Acesse no navegador: http://localhost:50005
echo    Para fechar, feche esta janela.
echo ========================================================
echo.

:: Roda o sistema e segura a janela aberta se der erro
node reconhecimentofacial.js

echo.
echo ========================================================
echo O SISTEMA PAROU OU DEU ERRO. LEIA A MENSAGEM ACIMA.
echo ========================================================
pause