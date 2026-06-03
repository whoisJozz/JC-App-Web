@echo off
color 0B
title JC App - Tunel Pinggy
echo ==========================================
echo      ABRIENDO TUNEL SSH PARA JC APP
echo ==========================================
echo.
echo Iniciando conexion segura por 60 minutos...
echo IMPORTANTE: Copia el enlace HTTPS que aparezca abajo.
echo.
ssh -p 443 -R0:127.0.0.1:3000 a.pinggy.io
pause