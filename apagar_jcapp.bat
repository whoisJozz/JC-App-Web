@echo off
color 0C
title JC App - Pausar Servidor
echo ==========================================
echo        PAUSANDO SERVIDORES JC APP
echo ==========================================
echo.
echo Congelando contenedores de forma segura...
echo.
docker-compose stop
echo.
echo ==========================================
echo ¡SISTEMA PAUSADO CORRECTAMENTE!
echo (Tus contenedores y redes siguen en la maquina)
echo ==========================================
pause