@echo off
echo =========================================
echo INICIANDO JC APP Y SERVICIOS DOCKER 
echo =========================================

echo.
echo [1/3] Levantando base de datos y servidor en segundo plano...
docker-compose up -d

echo.
echo [2/3] Esperando a que el servidor Node.js arranque correctamente...
timeout /t 5 /nobreak > NUL

echo.
echo [3/3] Abriendo el tunel seguro de Pinggy...
echo ATENCION: Copia el enlace que termina en .pinggy.link
echo (Para apagar todo, cierra esta ventana y ejecuta apagar_jcapp.bat)
echo.

ssh -p 443 -R0:localhost:3000 a.pinggy.io
pause