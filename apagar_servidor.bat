@echo off
color 0C
title JC App - Apagar Servidor
echo ==========================================
echo        APAGANDO SERVIDORES JC APP
echo ==========================================
echo.
echo Deteniendo contenedores de forma segura...
echo.
docker-compose down
echo.
echo ==========================================
echo ¡SISTEMA APAGADO CORRECTAMENTE!
echo (Tus registros y base de datos estan a salvo)
echo ==========================================
pause