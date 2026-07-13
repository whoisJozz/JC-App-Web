@echo off
color 0A
title JC App - Iniciar Servidor (Modo Offline)
echo ==========================================
echo        DESPERTANDO MOTORES DE JC APP
echo ==========================================
echo.
echo Iniciando contenedores guardados en memoria...
echo.
docker-compose up -d
echo.
echo ==========================================
echo ¡SISTEMA EN LINEA Y LISTO PARA EL CAMPAMENTO!
echo ==========================================
pause