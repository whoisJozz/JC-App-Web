@echo off
color 4F
title JC App - RESETEO NUCLEAR
echo ==========================================
echo   ADVERTENCIA: DESTRUCCION DE BASE DE DATOS
echo ==========================================
echo.
echo Presiona Ctrl+C si abriste esto por accidente.
echo Presiona cualquier tecla para continuar y borrar todo...
pause >nul
echo.
echo Destruyendo contenedores y volumenes huerfanos...
docker-compose down -v
docker system prune -f
echo.
echo ==========================================
echo ¡LIMPIEZA PROFUNDA TERMINADA! 
echo El sistema esta virgen para el proximo inicio.
echo ==========================================
pause