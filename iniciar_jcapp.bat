@echo off
color 0A
title JC App - Iniciar Servidor
echo ==========================================
echo        ENCENDIENDO MOTORES DE JC APP
echo ==========================================
echo.
echo Levantando Base de Datos y Servidor Node.js...
echo.
docker-compose up --build -d
echo.
echo ==========================================
echo ¡SISTEMA EN LINEA Y CONGELADO EN SEGUNDO PLANO!
echo Ya puedes cerrar esta ventana y abrir tu script de Pinggy.
echo ==========================================
pause